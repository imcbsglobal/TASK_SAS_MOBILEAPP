// app/Order/OrderDetails.js - FIXED VERSION with better barcode handling
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NetInfo from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import batchService from "../../src/services/batchService";
import dbService from "../../src/services/database";

const { width, height } = Dimensions.get("window");

const FlyingItem = ({ startX, startY, endX, endY, onComplete }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
      easing: (t) => t * t, // Quadratic easing for "drop" effect
    }).start(() => {
      onComplete && onComplete();
    });
  }, []);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, endX - 20], // Adjust for icon size
  });

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [startY, endY - 20],
  });

  const scale = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.2, 0.2], // Grow then shrink into cart
  });

  const opacity = animatedValue.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: Colors.accent.main,
        zIndex: 9999, // Ensure it's on top of everything
        transform: [
          { translateX },
          { translateY },
          { scale }
        ],
        opacity,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.md
      }}
    >
      <Ionicons name="cube" size={16} color="#FFF" />
    </Animated.View>
  );
};

// Handle Cart Item Price Change
const handleCartItemPriceChange = (productId, newPrice) => {
  const price = parseFloat(newPrice);
  if (isNaN(price)) return;

  const updatedCart = cart.map(item => {
    if (item.product.id === productId) {
      return {
        ...item,
        product: { ...item.product, price: price }
      };
    }
    return item;
  });
  setCart(updatedCart);
  cartRef.current = updatedCart;
};

const renderCartItem = ({ item }) => (
  <CartItem
    item={{
      ...item,
      onPriceChange: handleCartItemPriceChange
    }}
    changeQty={changeQty}
    removeItem={removeItem}
  />
);
const CartItem = ({ item, changeQty, removeItem, isEditable, onPriceChange }) => {
  const [localQty, setLocalQty] = useState(String(item.qty));

  useEffect(() => {
    setLocalQty(String(item.qty));
  }, [item.qty]);

  const handleTextChange = (text) => {
    setLocalQty(text);
    // Allow empty or partial decimal input while typing
    if (text === '' || text === '.') return;

    const val = parseFloat(text);
    if (!isNaN(val) && val > 0) {
      // Only update check if it ends with a valid number format to avoid jumpiness
      // But for responsive cart updates we probably want to update
      changeQty(item.product.id, val);
    }
  };

  const handleBlur = () => {
    const val = parseFloat(localQty);
    if (!localQty || isNaN(val) || val <= 0) {
      setLocalQty(String(item.qty));
    } else {
      setLocalQty(val.toFixed(3));
    }
  };

  return (
    <View style={styles.cartItem}>
      {/* Row 1: Item Name and Code */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.cartItemName} numberOfLines={2}>{item.product.name}</Text>
          <Text style={{ fontSize: 12, color: Colors.text.secondary, marginTop: 2 }}>
            Code: {item.product.code}
          </Text>
        </View>
        <TouchableOpacity onPress={() => removeItem(item.product.id)} style={[styles.removeCartItem, { padding: 8 }]}>
          <Ionicons name="trash-outline" size={22} color={Colors.error.main} />
        </TouchableOpacity>
      </View>

      {/* Row 2: Price | Quantity | Total */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Price Section */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: Colors.text.secondary, marginRight: 4 }}>@</Text>
            {isEditable ? (
              <TextInput
                style={[styles.cartItemPrice, {
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.accent[200],
                  minWidth: 50,
                  padding: 0,
                  fontSize: 15,
                  fontWeight: '600',
                  color: Colors.text.primary
                }]}
                value={String(item.product.price)}
                keyboardType="numeric"
                onChangeText={(text) => {
                  if (onPriceChange) onPriceChange(item.product.id, text);
                }}
              />
            ) : (
              <Text style={[styles.cartItemPrice, { fontSize: 15, fontWeight: '600', color: Colors.text.primary }]}>
                {parseFloat(item.product.price || 0).toFixed(2)}
              </Text>
            )}
          </View>
          {item.product.mrp > item.product.price && (
            <Text style={{ fontSize: 10, color: Colors.text.tertiary }}>
              MRP: {item.product.mrp}
            </Text>
          )}
        </View>

        {/* Quantity Section (Centered & Big) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.neutral[50], borderRadius: 8, padding: 2 }}>
          <TouchableOpacity onPress={() => changeQty(item.product.id, item.qty - 1)} style={{ padding: 8 }}>
            <Ionicons name="remove-circle" size={32} color={Colors.accent.main} />
          </TouchableOpacity>

          <TextInput
            style={{
              width: 60,
              height: 40,
              textAlign: 'center',
              borderWidth: 1,
              borderColor: Colors.border.medium,
              borderRadius: 6,
              marginHorizontal: 4,
              fontSize: 18, // Bigger font
              fontWeight: '700',
              color: Colors.text.primary,
              backgroundColor: '#FFF'
            }}
            keyboardType="numeric"
            selectTextOnFocus={true}
            value={localQty}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
          />

          <TouchableOpacity onPress={(e) => changeQty(item.product.id, item.qty + 1, e)} style={{ padding: 8 }}>
            <Ionicons name="add-circle" size={32} color={Colors.accent.main} />
          </TouchableOpacity>
        </View>

        {/* Total Section (Right) */}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={[styles.cartItemTotal, { fontSize: 15, marginHorizontal: 0 }]}>
            {(item.qty * item.product.price).toFixed(2)}
          </Text>
        </View>
      </View>
      {item.remark ? (
        <View style={styles.cartItemRemark}>
          <Ionicons name="chatbubble-outline" size={12} color={Colors.text.tertiary} />
          <Text style={styles.cartItemRemarkText}>{item.remark}</Text>
        </View>
      ) : null}
    </View>
  );
};

// Helper to map price codes to object properties
const PRICE_FIELD_MAP = {
  'MR': 'mrp',
  'S1': 'sales',
  'S2': 'retail', // Default usually
  'S3': 'dp',
  'S4': 'cb',
  'S5': 'netRate',
  'CO': 'cost'
};

const REMARK_OPTIONS = ["Expired", "ShortExpiry", "Damage", "Exchange"];


export default function ReturnDetails() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { area: paramArea = "", customer: paramCustomer = "", customerCode: paramCustomerCode = "", type = "", payment: paramPayment = "", priceCode: paramPriceCode = "", scanned, timestamp } = params;

  // Internalized states for customer details
  const [currentCustomer, setCurrentCustomer] = useState(paramCustomer);
  const [currentCustomerCode, setCurrentCustomerCode] = useState(paramCustomerCode);
  const [currentArea, setCurrentArea] = useState(paramArea);
  const [currentPayment, setCurrentPayment] = useState(paramPayment);

  // Customer selection states
  const [debtorsData, setDebtorsData] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");

  // CRITICAL: Use ref as source of truth for cart to prevent state loss
  const cartRef = useRef([]);
  const [cart, setCart] = useState([]);
  const flatListRef = useRef(null);
  const cartButtonRef = useRef(null);
  const quantityInputRef = useRef(null);
  const [cartLoaded, setCartLoaded] = useState(false); // Flag to prevent overwriting storage before load

  // Default Quantity State
  const [defaultQuantity, setDefaultQuantity] = useState(1);

  // Missing state variables
  const [loading, setLoading] = useState(false);
  const [appSettings, setAppSettings] = useState(null);
  const [username, setUsername] = useState(null);
  const [editingPrices, setEditingPrices] = useState({}); // { productId: "100.00" }
  const [fullCustomer, setFullCustomer] = useState(null);
  const [effectivePriceCode, setEffectivePriceCode] = useState('S2'); // Default
  const [restrictedPriceCodes, setRestrictedPriceCodes] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  // DEBUG: Monitor cart changes
  useEffect(() => {
    /* console.log('🛒🛒🛒 CART STATE CHANGED 🛒🛒🛒'); */
  }, [cart]);


  const [editingQty, setEditingQty] = useState({});
  const [editingRemarks, setEditingRemarks] = useState({}); // { productId: "manual note" }
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [activeRemarkProductId, setActiveRemarkProductId] = useState(null);
  const [remarkModalVisible, setRemarkModalVisible] = useState(false);

  // Pagination state for optimized loading
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const PRODUCTS_PER_PAGE = 100; // Optimized load size

  // Track last processed barcode to prevent duplicates
  const lastProcessedBarcode = useRef(null);

  // Filter modal state
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // This is categories
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterInStock, setFilterInStock] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState("brand");
  const [filterOptions, setFilterOptions] = useState({ brands: [], products: [], departments: [] });

  // State to hold the currently applied filters (triggers product fetch)
  const [filters, setFilters] = useState({
    brands: [],
    categories: [],
    departments: [],
    search: '',
    inStock: false
  });

  // Initialize App Settings and User
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedSettings = await AsyncStorage.getItem('app_settings');
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          setAppSettings(parsed);
          console.log('[ReturnDetails] App settings loaded');
          console.log('[ReturnDetails] barcode_based_list setting:', parsed.barcode_based_list);
        }

        const storedUser = await AsyncStorage.getItem('username');
        if (storedUser) {
          setUsername(storedUser);
          console.log('[ReturnDetails] Username loaded:', storedUser);
        }

        // LOAD SHOW STOCK ONLY SETTING (USER SPECIFIC)
        const userKey = storedUser ? `settings_show_stock_only_${storedUser}` : 'settings_show_stock_only';
        const showStockOnlyStr = await AsyncStorage.getItem(userKey);
        const showStockOnly = showStockOnlyStr === 'true';

        if (showStockOnly) {
          console.log(`[ReturnDetails] "Show Stock Only" setting is ENABLED for ${storedUser || 'unknown'}`);
          setFilterInStock(true);
          setFilters(prev => ({
            ...prev,
            inStock: true
          }));
        }

        // LOAD DEFAULT QUANTITY SETTING
        const qtyKey = storedUser ? `settings_default_quantity_${storedUser}` : 'settings_default_quantity';
        const defaultQtyStr = await AsyncStorage.getItem(qtyKey);
        if (defaultQtyStr !== null) {
          const qty = parseInt(defaultQtyStr, 10);
          setDefaultQuantity(qty);
          console.log(`[ReturnDetails] Default Quantity loaded: ${qty}`);
        }

        // LOAD DEBTORS DATA
        await loadDebtors();

      } catch (error) {
        console.error('[ReturnDetails] Failed to load settings/user:', error);
      }
    };
    loadSettings();
  }, []);

  const loadDebtors = async () => {
    try {
      await dbService.init();
      const allCustomers = await dbService.getCustomers();
      const filteredDebtors = allCustomers.filter((debtor) => debtor.super_code === "DEBTO");
      setDebtorsData(filteredDebtors);
      setFilteredCustomers(filteredDebtors);
    } catch (error) {
      console.error('[ReturnDetails] Error loading debtors:', error);
    }
  };

  // Filter customers based on search
  useEffect(() => {
    if (customerSearchQuery.trim() === "") {
      setFilteredCustomers(debtorsData);
    } else {
      const filtered = debtorsData.filter(customer =>
        customer.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
        customer.code.toLowerCase().includes(customerSearchQuery.toLowerCase())
      );
      setFilteredCustomers(filtered);
    }
  }, [customerSearchQuery, debtorsData]);

  const handleSelectCustomer = (selected) => {
    setCurrentCustomer(selected.name);
    setCurrentCustomerCode(selected.code);
    setCurrentArea(selected.area || selected.place || "");
    setShowCustomerModal(false);
    setCustomerSearchQuery("");
    console.log('[ReturnDetails] Changed customer to:', selected.name);
  };

  const openRemarkModal = (productId) => {
    setActiveRemarkProductId(productId);
    setRemarkModalVisible(true);
  };

  // Reload products when appSettings changes and barcode_based_list is true
  // OR trigger initial load when settings first become available
  useEffect(() => {
    if (appSettings) {
      if (allProducts.length > 0 && appSettings.barcode_based_list) {
        // Settings changed after products loaded - reload with new sort
        console.log('[ReturnDetails] Settings loaded with barcode_based_list=true, reloading products...');
        setPage(0);
        setHasMore(true);
        setAllProducts([]);
        setFilteredProducts([]);
        setFilters(prev => ({ ...prev }));
      } else if (allProducts.length === 0) {
        // Initial load - trigger product fetch now that settings are available
        console.log('[ReturnDetails] Settings loaded, triggering initial product load...');
        setFilters(prev => ({ ...prev }));
      }
    }
  }, [appSettings]);

  // Quantity modal state
  const [quantityModalVisible, setQuantityModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [tempQuantity, setTempQuantity] = useState("1");
  const [tempPrice, setTempPrice] = useState("");
  const [tempRemark, setTempRemark] = useState("");
  const [selectedRemarkOption, setSelectedRemarkOption] = useState("");
  const [remarkDropdownVisible, setRemarkDropdownVisible] = useState(false);


  // Details modal state
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedBatchDetails, setSelectedBatchDetails] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const sheetAnim = useRef(new Animated.Value(height)).current;
  const [sheetOpen, setSheetOpen] = useState(false);

  // Flying Animation State
  const [flyingItems, setFlyingItems] = useState([]);
  const [cartPosition, setCartPosition] = useState({ x: 0, y: 0 });

  const measureCartPosition = () => {
    cartButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setCartPosition({ x: pageX + width / 2, y: pageY + height / 2 });
    });
  };

  const triggerFlyAnimation = (startX, startY) => {
    // If start positions are not provided, default to center of screen
    const sX = startX || width / 2;
    const sY = startY || height / 2;

    const id = Date.now() + Math.random();
    setFlyingItems(prev => [...prev, { id, startX: sX, startY: sY }]);
  };

  // For highlighting scanned items
  // For highlighting scanned items
  const [highlightedProductId, setHighlightedProductId] = useState(null);

  // Pagination State
  const [page, setPage] = useState(1);
  // We don't use loadedCount anymore, we use page * PER_PAGE logic
  // const [loadedCount, setLoadedCount] = useState(0);

  // Effect to handle scrolling when a product is highlighted
  useEffect(() => {
    if (highlightedProductId && filteredProducts.length > 0) {
      const index = filteredProducts.findIndex(p => p.id === highlightedProductId);
      if (index >= 0 && flatListRef.current) {
        console.log('[ReturnDetails] Effect: Scrolling to index:', index);
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: index,
            animated: true,
            viewPosition: 0.5
          });
        }, 100);
      }
    }
  }, [highlightedProductId, filteredProducts.length]); // Re-run when highlight changes or list length changes

  // Fetch Full Customer Details & Calculate Effective Price Code
  useEffect(() => {
    const loadCustomerAndCalcPrice = async () => {
      let currentCustomerObj = fullCustomer;

      // 1. Fetch Customer if needed
      if ((!currentCustomerObj || currentCustomerObj.code !== currentCustomerCode) && currentCustomerCode) {
        try {
          await dbService.init();
          currentCustomerObj = await dbService.getCustomerByCode(currentCustomerCode);
          setFullCustomer(currentCustomerObj);
          console.log('[ReturnDetails] Loaded full customer:', currentCustomerObj?.name, 'RemarkTitle:', currentCustomerObj?.remarkcolumntitle);
        } catch (e) {
          console.error('[ReturnDetails] Error loading customer:', e);
        }
      }

      // 2. Calculate Effective Price Code
      let priceCode = 'S2'; // Global Fallback

      // PRIORITY 1: Explicit Parameter from Entry Screen
      if (paramPriceCode) {
        priceCode = paramPriceCode;
        console.log('[ReturnDetails] Using Param Price Code:', priceCode);
      }
      // PRIORITY 2: App Settings / Customer Default (Only if no param)
      else if (appSettings) {
        // Use default from settings if available
        if (appSettings.default_price_code) {
          priceCode = appSettings.default_price_code;
        }

        // Override with Customer Price Code if enabled and available
        // Override with Customer Price Code if enabled and available
        if (appSettings.read_price_category && currentCustomerObj?.remarkcolumntitle) {
          const code = currentCustomerObj.remarkcolumntitle.trim();

          // Verify if it's a valid code:
          // 1. Check against price_codes list in settings (if available)
          // 2. OR check against known standard codes (fallback)
          const isValidInSettings = appSettings.price_codes?.some(pc => pc.code === code);
          const isStandardCode = ['S1', 'S2', 'S3', 'S4', 'S5', 'MR', 'CO'].includes(code);

          if (isValidInSettings || isStandardCode) {
            priceCode = code;
            console.log('[ReturnDetails] Using Customer Price Code:', priceCode);
          } else {
            console.log('[ReturnDetails] Customer Price Code ignored (invalid):', code);
          }
        }
      }    // 3. Determine RESTRICTED Codes for this User (Protected Price Users = Deny List)
      // Normalize username to uppercase to match settings keys (e.g. "ARUN")
      const upperUser = username ? username.toUpperCase() : '';
      if (upperUser && appSettings.protected_price_users && appSettings.protected_price_users[upperUser]) {
        let restricted = [...appSettings.protected_price_users[upperUser]]; // Copy to allow modification

        // CRITICAL: Whitelist the Effective Price Code
        // If the customer is assigned a specific price code (priceCode), it MUST be visible
        // even if the user is normally restricted from it.
        if (priceCode && restricted.includes(priceCode)) {
          console.log(`[ReturnDetails] Whitelisting effective code ${priceCode} for this customer (Auto-Show)`);
          restricted = restricted.filter(c => c !== priceCode);
        }

        setRestrictedPriceCodes(restricted); // DENY List
        console.log('[ReturnDetails] Restricted codes for', upperUser, ':', restricted);
      } else {
        setRestrictedPriceCodes([]); // Empty array = No restrictions
      }

      setEffectivePriceCode(priceCode);
      console.log('[ReturnDetails] Effective Price Code:', priceCode);
    };

    if (appSettings) {
      loadCustomerAndCalcPrice();
    }
  }, [currentCustomerCode, appSettings, username]);

  // Apply Pricing Rules to a list of products
  const applyPricingToProducts = useCallback((products) => {
    if (!products) return [];

    return products.map(p => {
      // 1. Select Price Code
      const fieldName = PRICE_FIELD_MAP[effectivePriceCode] || 'retail';
      let dynamicPrice = p[fieldName];

      // PRIORITIZE: Check the dynamic prices array if it exists (highly accurate)
      if (p.prices && Array.isArray(p.prices) && p.prices.length > 0) {
        const searchCode = (effectivePriceCode || '').trim().toUpperCase();
        const found = p.prices.find(pr => {
          const pc = (pr.price_code || pr.code || '').trim().toUpperCase();
          return pc === searchCode;
        });
        if (found) {
          const val = parseFloat(found.value || found.price || 0);
          if (val > 0) dynamicPrice = val;
        }
      }

      // Fallback if price is still missing or 0
      if (!dynamicPrice && fieldName !== 'retail') {
        dynamicPrice = p.retail || p.price;
      }

      // Final safety check
      if (dynamicPrice === undefined || dynamicPrice === null || dynamicPrice === 0) {
        dynamicPrice = p.price || p.retail || 0;
      }

      // 2. Attach Restricted Codes
      return {
        ...p,
        price: parseFloat(dynamicPrice),
        originalPrice: p.price, // Keep original
        priceCodeUsed: effectivePriceCode,
        restrictedCodes: restrictedPriceCodes || [] // passing the DENY list
      };
    });
  }, [effectivePriceCode, restrictedPriceCodes]);

  // Re-apply pricing when rules change
  // Re-apply pricing when rules change OR when products are loaded initially
  useEffect(() => {
    if (allProducts.length > 0) {
      // Check if update is needed to avoid infinite loop
      // We check the first product's priceCodeUsed to see if it matches current effective code
      // AND also check if allowedCodes have changed
      const currentCode = allProducts[0].priceCodeUsed;

      const currentRestricted = allProducts[0].restrictedCodes;

      // Simple comparison
      const restrictedChanged = JSON.stringify(currentRestricted) !== JSON.stringify(restrictedPriceCodes);

      if (currentCode !== effectivePriceCode || restrictedChanged) {
        console.log('[ReturnDetails] Re-applying pricing rules (Code mismatch or Restrictions changed)');
        const updatedAll = applyPricingToProducts(allProducts);
        setAllProducts(updatedAll);

        if (filteredProducts.length > 0) {
          const updatedFiltered = applyPricingToProducts(filteredProducts);
          setFilteredProducts(updatedFiltered);
        }
      }
    }
  }, [effectivePriceCode, restrictedPriceCodes, allProducts]); // Dependencies for re-calculation

  // OPTIMIZED: Load products with pagination for better performance
  async function fetchAllProducts(isRefresh = false) {
    // Wait for appSettings to be loaded before fetching products
    if (!appSettings) {
      console.log('[ReturnDetails] Waiting for appSettings to load before fetching products...');
      return;
    }

    if (!isRefresh) {
      setLoading(true);
      setAllProducts([]); // Clear existing list
      setFilteredProducts([]);
      setPage(0);
      setHasMore(true);
    }

    try {
      console.log('[ReturnDetails] Loading first batch of products...');
      await dbService.init();

      const barcodeBasedList = appSettings?.barcode_based_list === true || appSettings?.barcode_based_list === 'true';
      const currentFilters = {
        brands: filters.brands || [],
        categories: filters.categories || [],
        departments: filters.departments || [],
        search: filters.search || '',
        sortBy: barcodeBasedList ? 'barcode' : 'name'
      };

      console.log('[ReturnDetails] Fetching products with filters:', JSON.stringify(currentFilters));

      // Load first page with LIMIT and FILTERS
      let products = await batchService.getProductBatchesOffline(PRODUCTS_PER_PAGE, 0, currentFilters);

      // FALLBACK: If no products found with filters, but search is empty, try loading ALL products
      if (products.length === 0 && !currentFilters.search && currentFilters.brands.length === 0 && currentFilters.categories.length === 0 && currentFilters.departments.length === 0) {
        console.warn('[ReturnDetails] No products found with filters, attempting raw fallback load...');
        products = await batchService.getProductBatchesOffline(PRODUCTS_PER_PAGE, 0, { sortBy: currentFilters.sortBy });
      }


      // Transform to cards (which expands batches) - pass sortBy for card-level sorting
      const sortBy = appSettings?.barcode_based_list ? 'barcode' : 'name';
      console.log('[ReturnDetails] Sorting by:', sortBy, '(barcode_based_list =', appSettings?.barcode_based_list, ')');
      let cards = batchService.transformBatchesToCards(products, sortBy);

      // Additional Client-side filtering for In Stock
      if (filters.inStock) {
        cards = cards.filter(card => card.stock > 0);
      }

      // Apply Dynamic Pricing
      cards = applyPricingToProducts(cards);

      console.log(`[ReturnDetails] Loaded ${cards.length} cards`);
      setAllProducts(cards);
      setFilteredProducts(cards);
      setPage(1); // Reset page to 1 after initial load
      setHasMore(products.length >= PRODUCTS_PER_PAGE); // Use products length for pagination check
    } catch (error) {
      console.error('[ReturnDetails] Error loading products:', error);
      Alert.alert(
        "Error",
        `Failed to load products: ${error.message}. Please try downloading data from Home screen.`,
        [
          { text: "Retry", onPress: () => fetchAllProducts(isRefresh) },
          { text: "Go to Home", onPress: () => router.replace("/(tabs)/Home") }
        ]
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Load more products (pagination)
  async function loadMoreProducts() {
    if (loadingMore || !hasMore || loading) return;

    setLoadingMore(true);
    try {
      console.log(`[ReturnDetails] Loading more products... (page: ${page})`);

      const offset = page * PRODUCTS_PER_PAGE;
      const currentFilters = {
        brands: filters.brands,
        categories: filters.categories,
        departments: filters.departments,
        search: filters.search,
        sortBy: appSettings?.barcode_based_list ? 'barcode' : 'name'
      };

      const products = await batchService.getProductBatchesOffline(
        PRODUCTS_PER_PAGE,
        offset,
        currentFilters
      );

      if (products.length === 0) {
        console.log('[ReturnDetails] No more products to load');
        setHasMore(false);
        return;
      }

      // Transform to cards
      const sortBy = appSettings?.barcode_based_list ? 'barcode' : 'name';
      let newCards = batchService.transformBatchesToCards(products, sortBy);

      // Additional Client-side filtering for In Stock
      if (filters.inStock) {
        newCards = newCards.filter(card => card.stock > 0);
      }

      // Apply Dynamic Pricing
      newCards = applyPricingToProducts(newCards);

      console.log(`[ReturnDetails] Loaded ${newCards.length} more batch cards`);

      setAllProducts(prev => [...prev, ...newCards]);
      setFilteredProducts(prev => [...prev, ...newCards]);
      setPage(prev => prev + 1);

      if (products.length < PRODUCTS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('[ReturnDetails] Error loading more products:', error);
    } finally {
      setLoadingMore(false);
    }
  }

  // Load filter options directly from DB
  async function loadFilterOptions() {
    try {
      console.log('[ReturnDetails] Loading distinct filter options from DB...');
      await dbService.init();
      const brands = await dbService.getDistinctBrands();
      const categories = await dbService.getDistinctCategories();
      const departments = await dbService.getDistinctDepartments();

      console.log(`[ReturnDetails] Loaded ${brands.length} brands, ${categories.length} categories, and ${departments.length} departments`);
      setFilterOptions({ brands, products: categories, departments }); // Stores categories
    } catch (error) {
      console.error('[ReturnDetails] Error loading filter options:', error);
    }
  }

  // Apply filters by reloading from DB
  const applyFilters = () => {
    console.log('[ReturnDetails] === APPLYING FILTERS DB-SIDE ===');
    console.log('Selected Brands:', selectedBrands);
    console.log('Selected Categories:', selectedProducts);
    console.log('Search Query:', query);
    console.log('In Stock Only:', filterInStock);

    setFilters({
      brands: selectedBrands,
      categories: selectedProducts, // categories
      departments: selectedDepartments,
      search: query,
      inStock: filterInStock
    });
    setFilterModalVisible(false);
  };

  // Clear all filters
  const clearFilters = () => {
    console.log('[ReturnDetails] Clearing all filters');
    setSelectedBrands([]);
    setSelectedProducts([]);
    setSelectedDepartments([]);
    setFilterQuery('');
    setFilterInStock(false);
    setQuery(''); // Clear main search query as well

    setFilters({
      brands: [],
      categories: [], // categories
      departments: [],
      search: '',
      inStock: false
    });
    setFilterModalVisible(false);
  };

  // Toggle brand selection
  function toggleBrandSelection(brand) {
    setSelectedBrands(prev => {
      const isSelected = prev.includes(brand);
      if (isSelected) {
        return prev.filter(b => b !== brand);
      } else {
        return [...prev, brand];
      }
    });
  }

  // Toggle product (category) selection
  function toggleCategorySelection(category) {
    setSelectedProducts(prev => {
      const isSelected = prev.includes(category);
      if (isSelected) {
        return prev.filter(p => p !== category);
      } else {
        return [...prev, category];
      }
    });
  }

  // Toggle department selection
  function toggleDepartmentSelection(dept) {
    setSelectedDepartments(prev => {
      const isSelected = prev.includes(dept);
      if (isSelected) {
        return prev.filter(d => d !== dept);
      } else {
        return [...prev, dept];
      }
    });
  }

  // Search product by barcode - IMPROVED VERSION
  async function fetchProductByBarcode(barcode) {
    const cleanBarcode = barcode.trim();

    if (!cleanBarcode) {
      Alert.alert("Error", "Please enter a valid barcode");
      return null;
    }

    setSearchLoading(true);
    try {
      console.log('[ReturnDetails] Searching for barcode:', cleanBarcode);
      await dbService.init();

      // First try exact barcode match
      let product = await dbService.getProductByBarcode(cleanBarcode);

      // If not found by barcode, try by code
      if (!product) {
        console.log('[ReturnDetails] Not found by barcode, trying by code...');
        const searchResults = await dbService.searchProducts(cleanBarcode);

        if (searchResults.length > 0) {
          product = searchResults[0];
          console.log('[ReturnDetails] Found by code:', product.name);
        }
      }

      if (!product) {
        console.log('[ReturnDetails] Product not found in database');
        Alert.alert(
          "Not Found",
          `Product with barcode "${cleanBarcode}" not found in database.\n\nPlease ensure:\n• Product data is downloaded\n• Barcode is correct`
        );
        return null;
      }

      console.log('[ReturnDetails] Product found:', product.name);

      return {
        ...product, // Preserve all fields (retail, dp, etc.)
        id: product.id || product.code,
        code: product.code,
        name: product.name,
        barcode: product.barcode || product.code,
        stock: product.stock || 0,
        brand: product.brand || '',
        unit: product.unit || '',
        photos: product.photos || [],
        taxcode: product.taxcode || '',
        text6: product.text6 || '',
        productCategory: product.category || '',
        // Don't overwrite product.price if it exists and is > 0
        price: product.price || product.retail || 0,
        mrp: product.mrp || 0,
      };

    } catch (error) {
      console.error('[ReturnDetails] Error searching product:', error);
      Alert.alert("Error", `Failed to search product: ${error.message}`);
      return null;
    } finally {
      setSearchLoading(false);
    }
  }

  // Handle pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllProducts(true);
  };

  // Initial load and network monitoring
  useEffect(() => {
    loadFilterOptions();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    return () => {
      unsubscribe();
      lastProcessedBarcode.current = null;
    };
  }, []);

  // Effect to fetch products when filters change
  useEffect(() => {
    console.log('[ReturnDetails] Filters changed, fetching products...');
    fetchAllProducts();
  }, [filters]);

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBackPress();
        return true; // Prevent default back behavior
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [cart, sheetOpen, detailsModalVisible, quantityModalVisible, imageModalVisible, filterModalVisible])
  );

  // Load pending orders count on focus
  useFocusEffect(
    useCallback(() => {
      loadPendingOrdersCount();
    }, [])
  );

  const loadPendingOrdersCount = async () => {
    try {
      const username = await AsyncStorage.getItem('username');
      const storageKey = `placed_orders_${username}`;
      const existingOrders = await AsyncStorage.getItem(storageKey);
      if (existingOrders) {
        const orders = JSON.parse(existingOrders);
        // Filter: Count only if status is NOT uploaded
        const pendingCount = orders.filter(o =>
          !o.uploadStatus ||
          (o.uploadStatus !== 'uploaded' && o.uploadStatus !== 'uploaded to server')
        ).length;
        setPendingOrderCount(pendingCount);
      } else {
        setPendingOrderCount(0);
      }
    } catch (error) {
      console.error('[ReturnDetails] Error loading pending orders:', error);
    }
  };

  // Handle barcode scanning - IMPROVED VERSION
  useEffect(() => {
    if (scanned && scanned !== lastProcessedBarcode.current) {
      console.log('[ReturnDetails] New barcode received:', scanned);
      lastProcessedBarcode.current = scanned;

      const code = String(scanned).trim();
      handleScannedBarcode(code);

      // Clear the scanned param after processing
      setTimeout(() => {
        router.setParams({
          area: currentArea,
          customer: currentCustomer,
          customerCode: currentCustomerCode,
          type,
          payment: currentPayment,
          scanned: undefined,
          timestamp: undefined
        });
      }, 500);
    }
  }, [scanned, timestamp, handleScannedBarcode]);

  // Instant Search Debounce logic
  useEffect(() => {
    // Only trigger if query has changed and is different from current filter search
    if (query !== filters.search) {
      const timer = setTimeout(() => {
        console.log('[ReturnDetails] Instant search triggered for:', query);
        setFilters(prev => ({ ...prev, search: query }));
      }, 500); // 500ms debounce

      return () => clearTimeout(timer);
    }
  }, [query]);

  // Handle search by text
  const handleSearch = () => {
    console.log('[ReturnDetails] Handle search called');
    // Update the 'search' part of the filters state
    setFilters(prev => ({ ...prev, search: query }));
  };

  // Handle scanned barcode - ENHANCED VERSION with highlighting and scrolling
  const handleScannedBarcode = useCallback(async (code) => {
    console.log('🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴');
    console.log('[ReturnDetails] 📱 BARCODE SCANNED:', code);

    // First, check in already loaded products
    let productToShow = allProducts.find((p) =>
      p.barcode === code || p.code === code
    );

    console.log('[ReturnDetails] 🔍 Searching in loaded products...');
    if (productToShow) {
      console.log('[ReturnDetails] ✅ Found in loaded products!');
      console.log('[ReturnDetails] Product Name:', productToShow.name);
      console.log('[ReturnDetails] Product ID:', productToShow.id);
      console.log('[ReturnDetails] Product Code:', productToShow.code);
      console.log('[ReturnDetails] Product Barcode:', productToShow.barcode);
    } else {
      console.log('[ReturnDetails] ❌ NOT found in loaded products');
    }

    if (productToShow) {
      // Re-apply pricing rules to ensure current effective price is used
      const [pricedProduct] = applyPricingToProducts([productToShow]);
      if (pricedProduct) {
        productToShow = pricedProduct;
      }

      // Ensure it's in the filtered list (might be filtered out)
      setFilteredProducts(prev => {
        const exists = prev.find(p => p.id === productToShow.id);
        return exists ? prev : [productToShow, ...prev];
      });

      // Highlight and scroll to the product
      highlightAndScrollToProduct(productToShow);

      // Open quantity modal
      openQuantityModal(productToShow);
      console.log('🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴');
      return;
    }

    // If not found in loaded products, search database
    console.log('[ReturnDetails] Product not in loaded list, searching database...');
    setSearchLoading(true);
    const fetchedProduct = await fetchProductByBarcode(code);
    setSearchLoading(false);

    if (fetchedProduct) {
      console.log('[ReturnDetails] Product found in database:', fetchedProduct.name);

      // CRITICAL FIX: Check if this product already exists in allProducts or filteredProducts
      // to ensure we use the SAME ID and avoid duplicates
      let existingProduct = allProducts.find(p =>
        p.code === fetchedProduct.code ||
        p.barcode === code ||
        p.id.startsWith(`${fetchedProduct.code}_`)
      );

      if (!existingProduct) {
        existingProduct = filteredProducts.find(p =>
          p.code === fetchedProduct.code ||
          p.barcode === code ||
          p.id.startsWith(`${fetchedProduct.code}_`)
        );
      }

      let productCard;

      if (existingProduct) {
        // Use the existing product card to ensure ID consistency
        console.log('[ReturnDetails] Found existing product in list, using its ID:', existingProduct.id);
        productCard = existingProduct;
      } else {
        // Product not in list yet, create new card with consistent ID
        // Match the ID format from batchService.transformBatchesToCards
        let generatedId;
        if (fetchedProduct.barcode || fetchedProduct.batchId) {
          // Has batch info - use format: code_barcode
          generatedId = `${fetchedProduct.code}_${fetchedProduct.barcode || fetchedProduct.batchId}`;
        } else {
          // No batch info - just use code
          generatedId = fetchedProduct.code;
        }

        productCard = {
          ...fetchedProduct,
          id: generatedId,
          photos: fetchedProduct.photos || [],
          // Preserve fields
          mrp: fetchedProduct.mrp || 0,
          price: fetchedProduct.price || fetchedProduct.retail || 0,
          stock: fetchedProduct.stock || 0,
          brand: fetchedProduct.brand || '',
          unit: fetchedProduct.unit || '',
          productCategory: fetchedProduct.productCategory || fetchedProduct.category || '',
        };

        console.log('[ReturnDetails] Generated new product card with ID:', productCard.id);

        // Apply dynamic pricing to the new card
        const [pricedCard] = applyPricingToProducts([productCard]);
        if (pricedCard) {
          productCard = pricedCard;
        }

        // Add to both lists
        setAllProducts(prev => {
          const exists = prev.find(p => p.id === productCard.id);
          if (!exists) console.log('[ReturnDetails] Adding new item to AllProducts:', productCard.id);
          return exists ? prev : [productCard, ...prev];
        });

        setFilteredProducts(prev => {
          const exists = prev.find(p => p.id === productCard.id);
          if (!exists) console.log('[ReturnDetails] Adding new item to filteredProducts:', productCard.id);
          return exists ? prev : [productCard, ...prev];
        });
      }

      // Highlight and scroll to product
      highlightAndScrollToProduct(productCard);

      // Open quantity modal
      openQuantityModal(productCard);
    } else {
      console.log('[ReturnDetails] Product not found in database');
    }
  }, [allProducts, filteredProducts, addToCart, applyPricingToProducts]);

  // Highlight and scroll to a product in the list
  function highlightAndScrollToProduct(product) {
    console.log('[ReturnDetails] Highlighting product:', product.name);

    // Set highlighted state
    setHighlightedProductId(product.id);

    // Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedProductId(null);
    }, 3000);

    // Scroll to the product
    setTimeout(() => {
      // Use a functional update to get the latest list if needed, but we can't inside scrollTo.
      // Instead, we trust the list has updated. 
      // We need to find the index IN THE LIST THAT FLATLIST IS RENDERING.
      // Since we just updated state, we might need to wait for render.
      // 300ms is usually enough.

      // We will look up the index fresh from the ref if possible or just use the current state
      // But the state 'filteredProducts' here is from the closure when this function was defined.
      // This is the bug. The closure has STALE filteredProducts.

      // FIX: We can't easily access the "future" state here.
      // But we can trigger a side-effect.

      // Let's rely on the fact that if we just added it, it's at index 0 (if we prepended).
      // If it changed position, we need to know.

      // Better approach: Don't use closure state.
      // We will use the 'highlightedProductId' effect to handle scrolling.
    }, 300);
  }

  function openQuantityModal(product, forcedQty = null) {
    console.log('[ReturnDetails] Opening quantity modal for:', product.name, 'Price:', product.price);
    setSelectedProduct(product);

    // Check if item is already in cart to provide better initial quantity
    const existing = cartRef.current?.find(it => it.product.id === product.id);
    // Use default quantity preference if not in cart (0 or 1)
    const initialQty = forcedQty ?? (existing ? existing.qty + 1 : (defaultQuantity !== undefined ? defaultQuantity : 1));

    setTempQuantity(String(initialQty));
    // Initialize temp price (ensure it's a valid string)
    const initialPrice = product.price || product.retail || product.mrp || 0;
    setTempPrice(String(initialPrice));
    setTempRemark(existing?.remark || "");
    setSelectedRemarkOption("NONE"); // Default to NONE
    setRemarkDropdownVisible(false);
    setQuantityModalVisible(true);

  }

  function closeQuantityModal() {
    setQuantityModalVisible(false);
    setSelectedProduct(null);
    setTempQuantity("1");
    setRemarkDropdownVisible(false);
  }

  function handleConfirmQuantity() {
    if (selectedProduct) {
      const qty = parseFloat(tempQuantity);
      if (isNaN(qty) || qty <= 0) {
        Alert.alert("Invalid Quantity", "Please enter a valid quantity");
        return;
      }

      // Handle Price Override
      let productToAdd = selectedProduct;
      if (appSettings?.order_rate_editable) {
        const price = parseFloat(tempPrice);
        if (!isNaN(price) && price >= 0) {
          productToAdd = { ...selectedProduct, price: price };
        }
      }

      // Merge selected option and manual text
      const finalRemark = [
        selectedRemarkOption !== "NONE" ? selectedRemarkOption : "",
        tempRemark
      ].filter(Boolean).join(" - ");

      addToCart(productToAdd, qty, null, true, finalRemark); // Use overwrite=true for modal

      closeQuantityModal();
    }
  }

  // Key for persisting temporary cart - dynamic based on username
  const getCartKey = (user) => `temp_return_cart_${user}`;

  // Load cart from storage when username changes
  useEffect(() => {
    async function loadCart() {
      if (!username) return;
      try {
        const key = getCartKey(username);
        const savedCartStr = await AsyncStorage.getItem(key);

        let initialCart = [];
        if (savedCartStr) {
          initialCart = JSON.parse(savedCartStr);
          console.log('[ReturnDetails] 📥 Loaded persisted cart for', username, ':', initialCart.length, 'items');
        }

        // MERGE LOGIC: Combine persisted cart with any items added to cartRef while loading
        const currentItems = cartRef.current || [];

        if (currentItems.length > 0) {
          console.log('[ReturnDetails] ⚠️ Merging loaded cart with currently added items');
          const merged = [...currentItems];
          initialCart.forEach(loadedItem => {
            // Add loaded items only if they aren't already in the current (newest) list
            const exists = merged.find(p => p.product.id === loadedItem.product.id);
            if (!exists) {
              merged.push(loadedItem);
            }
          });
          initialCart = merged;
        }

        setCart(initialCart);
        cartRef.current = initialCart;

        // If we merged, we should save the merged result back to storage immediately
        if (currentItems.length > 0) {
          saveCartToStorage(initialCart);
        }
      } catch (error) {
        console.error('[ReturnDetails] Error loading cart:', error);
      } finally {
        setCartLoaded(true); // Mark as loaded so future updates can save
      }
    }
    loadCart();
  }, [username]);

  // Save cart to storage whenever it changes (via helper)
  const saveCartToStorage = useCallback(async (newCart) => {
    if (!username) return;
    try {
      const key = getCartKey(username);
      await AsyncStorage.setItem(key, JSON.stringify(newCart));
      console.log('[ReturnDetails] 💾 Cart saved:', newCart.length, 'items');
    } catch (error) {
      console.error('[ReturnDetails] Error saving cart:', error);
    }
  }, [username]);



  // Sort cart items by product code ascending (numeric-aware)
  const sortCartByCode = (items) =>
    [...items].sort((a, b) =>
      String(a.product.code || '').localeCompare(String(b.product.code || ''), undefined, { numeric: true, sensitivity: 'base' })
    );

  // Cart Animation State
  const cartScale = useRef(new Animated.Value(1)).current;

  const triggerCartAnimation = useCallback(() => {
    Animated.sequence([
      Animated.timing(cartScale, {
        toValue: 1.5,
        duration: 200, // Faster pop
        useNativeDriver: true,
      }),
      Animated.spring(cartScale, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const addToCart = useCallback((product, quantity = 1, startCoords = null, overwrite = false, remark = "") => {

    console.log('═══════════════════════════════════════════════════════');
    console.log('[ReturnDetails] ➕ ADD TO CART CALLED');
    console.log('[ReturnDetails] Product:', product.name, 'ID:', product.id);
    console.log('[ReturnDetails] Quantity:', quantity);
    console.log('[ReturnDetails] Current cartRef length:', cartRef.current?.length || 0);

    // Trigger Flying Animation first
    if (startCoords) {
      triggerFlyAnimation(startCoords.x, startCoords.y);
    } else {
      triggerFlyAnimation(); // Defaults to center (for modal)
    }

    // CRITICAL FIX: Use cartRef as source of truth with safe initialization
    const currentCart = [...(cartRef.current || [])];
    console.log('[ReturnDetails] Current cart contents:', currentCart.map(i => ({ name: i.product.name, id: i.product.id, qty: i.qty })));

    const idx = currentCart.findIndex((it) => it.product.id === product.id);

    let newCart;
    if (idx >= 0) {
      // Item already exists - update quantity
      console.log('[ReturnDetails] ✏️  Updating existing item at index', idx);
      newCart = [...currentCart];
      newCart[idx] = {
        ...newCart[idx],
        qty: overwrite ? quantity : newCart[idx].qty + quantity,
        remark: remark || (overwrite ? "" : newCart[idx].remark)
      };
    } else {
      // New item - add to end then sort
      console.log('[ReturnDetails] ➕ Adding NEW item to cart');
      newCart = [...currentCart, { product, qty: quantity, remark }];
    }
    // Sort by product code ascending
    newCart = sortCartByCode(newCart);


    console.log('[ReturnDetails] New cart length:', newCart.length);
    console.log('[ReturnDetails] New cart contents:', newCart.map(i => ({ name: i.product.name, id: i.product.id, qty: i.qty })));

    // Update state, ref, and storage
    cartRef.current = newCart;
    setCart(newCart);

    // Only save to storage if initial load is complete
    if (cartLoaded) {
      saveCartToStorage(newCart);
    } else {
      console.log('[ReturnDetails] ⚠️ Skipping save to storage (Wait for loadCart merge)');
    }

    console.log('═══════════════════════════════════════════════════════');
  }, [cartLoaded, triggerCartAnimation, saveCartToStorage]);

  const changeQty = useCallback((productId, qty, event) => {
    const currentCart = [...(cartRef.current || [])];
    const item = currentCart.find((it) => it.product.id === productId);
    const oldQty = item ? item.qty : 0;

    // Check if increasing quantity
    if (qty > oldQty) {
      // Trigger animation
      let startCoords = null;
      if (event && event.nativeEvent) {
        startCoords = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      }
      triggerFlyAnimation(startCoords?.x, startCoords?.y);
    }

    const newCart = sortCartByCode(
      currentCart.map((it) => (it.product.id === productId ? { ...it, qty: Math.max(0, qty) } : it)).filter((it) => it.qty > 0)
    );

    cartRef.current = newCart;
    setCart(newCart);
    if (cartLoaded) {
      saveCartToStorage(newCart);
    }
  }, [cartLoaded, saveCartToStorage, triggerFlyAnimation]);

  const removeItem = useCallback((productId) => {
    const currentCart = [...(cartRef.current || [])];
    const newCart = currentCart.filter((it) => it.product.id !== productId);

    cartRef.current = newCart;
    setCart(newCart);
    if (cartLoaded) {
      saveCartToStorage(newCart);
    }
  }, [cartLoaded, saveCartToStorage]);

  function toggleSheet(open) {
    setSheetOpen(open);
    Animated.spring(sheetAnim, {
      toValue: open ? 0 : height,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start();
  }

  function openImageModal(photos, index = 0) {
    if (photos && photos.length > 0) {
      setSelectedImage(photos);
      setCurrentImageIndex(index);
      setImageModalVisible(true);
    }
  }

  function closeImageModal() {
    setImageModalVisible(false);
    setSelectedImage(null);
    setCurrentImageIndex(0);
  }

  function openDetailsModal(batchCard) {
    setSelectedBatchDetails(batchCard);
    setCurrentPhotoIndex(0);
    setDetailsModalVisible(true);
  }

  function closeDetailsModal() {
    setDetailsModalVisible(false);
    setSelectedBatchDetails(null);
    setCurrentPhotoIndex(0);
  }

  function handleBackPress(targetRoute = "/SalesReturn/ReturnEntry") {
    // 1. Close Modals if open
    if (imageModalVisible) {
      closeImageModal();
      return;
    }
    if (quantityModalVisible) {
      closeQuantityModal();
      return;
    }
    if (detailsModalVisible) {
      closeDetailsModal();
      return;
    }
    if (filterModalVisible) {
      setFilterModalVisible(false);
      return;
    }
    if (sheetOpen) {
      toggleSheet(false);
      return;
    }

    if (cart.length > 0) {
      Alert.alert(
        "Cart Not Empty",
        `You have ${cart.length} item(s) in your cart. What would you like to do?`,
        [
          {
            text: "Place Order",
            onPress: handlePlaceOrder,
            style: "default"
          },
          {
            text: "Discard Cart",
            onPress: async () => {
              setCart([]);
              cartRef.current = [];
              if (username) await AsyncStorage.removeItem(getCartKey(username));
              router.replace(targetRoute);
            },
            style: "destructive"
          },
          {
            text: "Cancel",
            style: "cancel"
          }
        ]
      );
    } else {
      router.replace(targetRoute);
    }
  }

  async function handlePlaceOrder() {
    if (cart.length === 0) {
      Alert.alert("Empty Cart", "Please add items to cart before placing order");
      return;
    }

    try {
      const order = {
        id: `order_${Date.now()}`,
        customer: currentCustomer || "Unknown Customer",
        customerCode: currentCustomerCode || "",
        area: currentArea,
        type: type,
        payment: currentPayment,
        items: cart.map(item => ({
          productId: item.product.id,
          code: item.product.code,
          name: item.product.name,
          barcode: item.product.barcode,
          batchId: item.product.batchId || null,
          mrp: item.product.mrp || 0,
          price: item.product.price,
          qty: item.qty,
          total: item.qty * item.product.price,
          hsn: item.product.text6 || '', // Save HSN
          gst: item.product.taxcode || '', // Save GST
          remark: item.remark || "" // Save Remark
        })),
        total: cart.reduce((s, it) => s + it.qty * it.product.price, 0),
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      const username = await AsyncStorage.getItem('username');
      const storageKey = `return_orders_${username}`;
      const existingOrders = await AsyncStorage.getItem(storageKey);
      const orders = existingOrders ? JSON.parse(existingOrders) : [];
      orders.push(order);
      await AsyncStorage.setItem(storageKey, JSON.stringify(orders));

      setCart([]);
      cartRef.current = [];
      if (username) {
        await AsyncStorage.removeItem(getCartKey(username));
      }

      toggleSheet(false);

      Alert.alert(
        "Order Placed Successfully",
        `Order placed for ${currentCustomer}\nTotal:  ${order.total.toFixed(2)}`,
        [
          {
            text: "Continue Shopping",
            style: "cancel"
          },
          {
            text: "View Orders",
            onPress: () => router.push("/SalesReturn/PlaceReturn")
          },
          
        ]
      );
    } catch (error) {
      Alert.alert("Error", "Failed to place order. Please try again.");
      console.error(error);
    }
  }

  // Render empty state
  const renderEmptyState = () => {
    if (loading || searchLoading) return null;

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="cube-outline" size={60} color={Colors.accent[200]} />
        </View>
        <Text style={styles.emptyStateTitle}>
          {allProducts.length === 0 ? "No Products Available" : "No Search Results"}
        </Text>
        <Text style={styles.emptyStateText}>
          {allProducts.length === 0
            ? "Use the barcode scanner to add products"
            : `No products match your filters. Try adjusting your filters.`}
        </Text>
        <TouchableOpacity
          style={styles.scanActionBtn}
          onPress={() => router.push({
            pathname: "/SalesReturn/ReturnScanner",
            params: { area: currentArea, customer: currentCustomer, customerCode: currentCustomerCode, type, payment: currentPayment }
          })}
        >
          <LinearGradient
            colors={Gradients.accent}
            style={styles.scanActionGradient}
          >
            <Ionicons name="qr-code" size={20} color="#fff" />
            <Text style={styles.scanActionText}>Scan Barcode</Text>
          </LinearGradient>
        </TouchableOpacity>

        {allProducts.length === 0 && (
          <TouchableOpacity
            style={styles.refreshActionBtn}
            onPress={onRefresh}
          >
            <Ionicons name="refresh" size={20} color={Colors.accent.main} />
            <Text style={styles.refreshActionText}>Refresh Products</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const itemCount = cart.length;
  const total = cart.reduce((s, it) => s + it.qty * it.product.price, 0);
  const activeFiltersCount = selectedBrands.length + selectedProducts.length + selectedDepartments.length + (filterInStock ? 1 : 0);

  // Get filtered lists for filter modal
  const getFilteredOptions = (options, currentFilterQuery) => {
    if (!currentFilterQuery.trim()) return options;
    const search = currentFilterQuery.toLowerCase();
    return options.filter(option =>
      option.toLowerCase().includes(search)
    );
  };

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => handleBackPress()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.accent.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sales Return Details</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.content}>
          {/* Customer Card */}
          <TouchableOpacity
            style={styles.customerCard}
            onPress={() => setShowCustomerModal(true)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={Gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.customerGradient}
            >
              <View style={styles.customerIcon}>
                <Text style={styles.customerInitial}>{currentCustomer ? currentCustomer.charAt(0) : '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.customerName} numberOfLines={1}>{currentCustomer || "Unknown Customer"}</Text>
                  <Ionicons name="chevron-down" size={20} color="#FFF" style={{ opacity: 0.8 }} />
                </View>
                <Text style={styles.customerDetails}>
                  {currentArea && `${currentArea}`}
                  {type && ` • ${type}`}
                  {currentPayment && ` • ${currentPayment}`}
                </Text>
                <Text style={[styles.customerDetails, { marginTop: 4, opacity: 0.9, fontWeight: '600', color: Colors.secondary.light }]}>
                  Price Level: {effectivePriceCode}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>


          {/* Action Buttons Row */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => handleBackPress("/(tabs)/Home")}
            >
              <Ionicons name="home" size={20} color={Colors.accent.main} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => {
                console.log('[ReturnDetails] Scanner button pressed');
                router.push({
                  pathname: "/SalesReturn/ReturnScanner",
                  params: { area: currentArea, customer: currentCustomer, customerCode: currentCustomerCode, type, payment: currentPayment }
                });
              }}
            >
              <Ionicons name="qr-code" size={20} color={Colors.accent.main} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionIconButton, activeFiltersCount > 0 && styles.actionIconButtonActive]}
              onPress={() => {
                console.log('[ReturnDetails] Filter button pressed');
                setFilterModalVisible(true);
              }}
            >
              <Ionicons name="filter" size={20} color={activeFiltersCount > 0 ? "#FFF" : Colors.accent.main} />
              {activeFiltersCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => {
                console.log('[ReturnDetails] Refresh button pressed');
                onRefresh();
              }}
            >
              <Ionicons name="refresh" size={20} color={Colors.accent.main} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionIconButton, pendingOrderCount > 0 && styles.actionIconButtonActive]}
              onPress={() => {
                console.log('[ReturnDetails] View Orders button pressed');
                router.push("/SalesReturn/PlaceReturn");
              }}
            >
              <Ionicons name="receipt-outline" size={20} color={pendingOrderCount > 0 ? "#FFF" : Colors.accent.main} />
              {pendingOrderCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{pendingOrderCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              ref={cartButtonRef}
              style={[styles.actionIconButton, itemCount > 0 && styles.actionIconButtonActive]}
              onLayout={measureCartPosition} // Capture layout on mount/change
              onPress={() => {
                console.log('[ReturnDetails] Cart button pressed');
                toggleSheet(true);
              }}
            >
              <Animated.View style={{ transform: [{ scale: cartScale }] }}>
                <Ionicons name="cart-outline" size={22} color={itemCount > 0 ? "#FFF" : Colors.accent.main} />
              </Animated.View>
              {itemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{itemCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={Colors.text.tertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, code, barcode"
                placeholderTextColor={Colors.text.tertiary}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => {
                  setQuery("");
                  // Trigger search with empty query
                  setFilters(prev => ({ ...prev, search: '' }));
                }}>
                  <Ionicons name="close-circle" size={18} color={Colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
            >
              <LinearGradient colors={Gradients.secondary} style={styles.searchGradient}>
                <Ionicons name="search" size={22} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Active Filters Display */}
          {activeFiltersCount > 0 && (
            <View style={styles.activeFiltersContainer}>
              <Text style={styles.activeFiltersLabel}>Filters:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeFiltersList}>
                {selectedBrands.map(brand => (
                  <View key={brand} style={styles.activeFilterChip}>
                    <Text style={styles.activeFilterChipText}>{brand}</Text>
                    <TouchableOpacity onPress={() => {
                      toggleBrandSelection(brand);
                      setTimeout(() => applyFilters(), 100);
                    }}>
                      <Ionicons name="close-circle" size={16} color={Colors.accent.main} />
                    </TouchableOpacity>
                  </View>
                ))}
                {selectedProducts.map(product => (
                  <View key={product} style={styles.activeFilterChip}>
                    <Text style={styles.activeFilterChipText} numberOfLines={1}>{product}</Text>
                    <TouchableOpacity onPress={() => {
                      toggleCategorySelection(product);
                      setTimeout(() => applyFilters(), 100);
                    }}>
                      <Ionicons name="close-circle" size={16} color={Colors.accent.main} />
                    </TouchableOpacity>
                  </View>
                ))}
                {selectedDepartments.map(dept => (
                  <View key={dept} style={styles.activeFilterChip}>
                    <Text style={styles.activeFilterChipText} numberOfLines={1}>{dept}</Text>
                    <TouchableOpacity onPress={() => {
                      toggleDepartmentSelection(dept);
                      setTimeout(() => applyFilters(), 100);
                    }}>
                      <Ionicons name="close-circle" size={16} color={Colors.accent.main} />
                    </TouchableOpacity>
                  </View>
                ))}
                {filterInStock && (
                  <View key="inStock" style={styles.activeFilterChip}>
                    <Text style={styles.activeFilterChipText}>In Stock</Text>
                    <TouchableOpacity onPress={() => {
                      setFilterInStock(false);
                      setTimeout(() => applyFilters(), 100);
                    }}>
                      <Ionicons name="close-circle" size={16} color={Colors.accent.main} />
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
              <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersBtn}>
                <Text style={styles.clearFiltersBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loading States */}
          {(loading || searchLoading) && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.accent.main} />
              <Text style={styles.loadingText}>
                {searchLoading ? 'Searching product...' : 'Loading products...'}
              </Text>
            </View>
          )}

          {/* Product List */}
          {!loading && !searchLoading && (
            <FlatList
              ref={flatListRef}
              data={filteredProducts}
              extraData={{ cart, editingQty, highlightedProductId }}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[Colors.accent.main]}
                  tintColor={Colors.accent.main}
                />
              }
              ListEmptyComponent={renderEmptyState}
              onEndReached={loadMoreProducts}
              onEndReachedThreshold={0.5}
              onScrollToIndexFailed={(info) => {
                console.warn('[ReturnDetails] Scroll to index failed:', info);
                // Fallback: scroll to offset
                flatListRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
                // Retry scrolling after a delay
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({
                    index: info.index,
                    animated: true,
                    viewPosition: 0.5,
                  });
                }, 100);
              }}
              ListFooterComponent={() => {
                if (loadingMore) {
                  return (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={Colors.accent.main} />
                      <Text style={{ marginTop: 8, color: Colors.text.secondary, fontSize: 12 }}>
                        Loading more products...
                      </Text>
                    </View>
                  );
                }
                if (!hasMore && filteredProducts.length > 0) {
                  return (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: Colors.text.tertiary, fontSize: 12 }}>
                        All products loaded ({filteredProducts.length} items)
                      </Text>
                    </View>
                  );
                }
                if (hasMore && filteredProducts.length > 0 && !loading) {
                  return (
                    <TouchableOpacity
                      style={{ padding: 20, alignItems: 'center' }}
                      onPress={loadMoreProducts}
                    >
                      <Text style={{ color: Colors.accent.main, fontSize: 14, fontWeight: '600' }}>
                        Load More Products
                      </Text>
                    </TouchableOpacity>
                  );
                }
                return null;
              }}
              renderItem={({ item }) => {
                const cartItem = cart.find(c => c.product.id === item.id);
                const currentQty = cartItem?.qty || 0;
                const displayValue = editingQty[item.id] !== undefined ? editingQty[item.id] : String(currentQty);
                const inStock = true; // Always true for return pages for now
                const stockQty = item.stock || 0;
                const gStock = item.goddowns ? item.goddowns.reduce((sum, g) => sum + (parseFloat(g.quantity) || 0), 0) : 0;
                const isInCart = currentQty > 0;
                const isHighlighted = highlightedProductId === item.id;

                if (isInCart) {
                  console.log(`[ReturnDetails] Render Item ${item.id} IS IN CART.`);
                } else if (cart.length > 0 && item.id.includes('_')) {
                  console.log(`[ReturnDetails] Render Item ${item.id} NOT in cart. Cart IDs:`, cart.map(c => c.product.id));
                }

                return (
                  <CodeItem
                    item={item}
                    inStock={inStock}
                    stockQty={stockQty}
                    gStock={gStock}
                    currentQty={currentQty}
                    displayValue={displayValue}
                    isInCart={isInCart}
                    isHighlighted={isHighlighted}
                    setEditingQty={setEditingQty}
                    changeQty={changeQty}
                    removeItem={removeItem}
                    defaultQuantity={defaultQuantity}
                    editingQty={editingQty}
                    addToCart={(product, qty) => {
                      const remark = editingRemarks[product.id] || "";
                      if (appSettings?.order_rate_editable) {
                        openQuantityModal(product, qty);
                      } else {
                        addToCart(product, qty, null, false, remark);
                        // Clear remark after adding
                        setEditingRemarks(prev => {
                          const newState = { ...prev };
                          delete newState[product.id];
                          return newState;
                        });
                      }
                    }}
                    cartPrice={cartItem?.product.price}
                    editingRemarks={editingRemarks}
                    setEditingRemarks={setEditingRemarks}
                    openImageModal={openImageModal}
                    openDetailsModal={openDetailsModal}
                    openRemarkModal={openRemarkModal}
                  />
                );
              }}
            />
          )}
        </View>

        {/* Filter Modal */}
        <Modal
          visible={filterModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <View style={styles.filterModalOverlay}>
            <View style={styles.filterModalContent}>
              <View style={styles.filterModalHeader}>
                <Text style={styles.filterModalTitle}>Filter Products</Text>
                <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Filter Info */}
              <View style={styles.filterInfo}>
                <Text style={styles.filterInfoText}>
                  {filterOptions.brands.length} Brands • {filterOptions.products.length} Categories • {filterOptions.departments?.length || 0} Depts
                </Text>
              </View>

              {/* Filter Tabs */}
              <View style={styles.filterTabs}>
                <TouchableOpacity
                  style={[styles.filterTab, activeFilterTab === "brand" && styles.filterTabActive]}
                  onPress={() => setActiveFilterTab("brand")}
                >
                  <Text style={[styles.filterTabText, activeFilterTab === "brand" && styles.filterTabTextActive]}>
                    Brand {selectedBrands.length > 0 && `(${selectedBrands.length})`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterTab, activeFilterTab === "category" && styles.filterTabActive]}
                  onPress={() => setActiveFilterTab("category")}
                >
                  <Text style={[styles.filterTabText, activeFilterTab === "category" && styles.filterTabTextActive]}>
                    Category {selectedProducts.length > 0 && `(${selectedProducts.length})`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterTab, activeFilterTab === "department" && styles.filterTabActive]}
                  onPress={() => setActiveFilterTab("department")}
                >
                  <Text style={[styles.filterTabText, activeFilterTab === "department" && styles.filterTabTextActive]}>
                    Dept {selectedDepartments.length > 0 && `(${selectedDepartments.length})`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterTab, activeFilterTab === "options" && styles.filterTabActive]}
                  onPress={() => setActiveFilterTab("options")}
                >
                  <Text style={[styles.filterTabText, activeFilterTab === "options" && styles.filterTabTextActive]}>
                    Options
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Filter Search - Hide for Options tab */}
              {activeFilterTab !== 'options' && (
                <View style={styles.filterSearchBar}>
                  <Ionicons name="search" size={18} color={Colors.text.tertiary} />
                  <TextInput
                    style={styles.filterSearchInput}
                    placeholder={`Search ${activeFilterTab}s...`}
                    placeholderTextColor={Colors.text.tertiary}
                    value={filterQuery}
                    onChangeText={setFilterQuery}
                  />
                  {filterQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setFilterQuery("")}>
                      <Ionicons name="close-circle" size={16} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Filter List */}
              <ScrollView style={styles.filterList} showsVerticalScrollIndicator={false}>
                {activeFilterTab === "brand" && (
                  <>
                    {getFilteredOptions(filterOptions.brands, filterQuery).length === 0 ? (
                      <View style={styles.noResultsContainer}>
                        <Text style={styles.noResultsText}>No brands found</Text>
                      </View>
                    ) : (
                      getFilteredOptions(filterOptions.brands, filterQuery).map(brand => {
                        const isSelected = selectedBrands.includes(brand);
                        return (
                          <TouchableOpacity
                            key={brand}
                            style={styles.filterItem}
                            onPress={() => toggleBrandSelection(brand)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.filterItemLeft}>
                              <View style={[
                                styles.checkbox,
                                isSelected && styles.checkboxChecked
                              ]}>
                                {isSelected && (
                                  <Ionicons name="checkmark" size={16} color="#FFF" />
                                )}
                              </View>
                              <Text style={styles.filterItemText}>{brand}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                )}

                {activeFilterTab === 'category' && (
                  <>
                    {getFilteredOptions(filterOptions.products, filterQuery).length === 0 ? (
                      <View style={styles.noResultsContainer}>
                        <Text style={styles.noResultsText}>No categories found</Text>
                      </View>
                    ) : (
                      getFilteredOptions(filterOptions.products, filterQuery).map((category, index) => {
                        const isSelected = selectedProducts.includes(category);
                        return (
                          <TouchableOpacity
                            key={index}
                            style={styles.filterItem}
                            onPress={() => toggleCategorySelection(category)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.filterItemLeft}>
                              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                                {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                              </View>
                              <Text style={styles.filterItemText}>{category}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                )}

                {activeFilterTab === 'department' && (
                  <>
                    {getFilteredOptions(filterOptions.departments || [], filterQuery).length === 0 ? (
                      <View style={styles.noResultsContainer}>
                        <Text style={styles.noResultsText}>No departments found</Text>
                      </View>
                    ) : (
                      getFilteredOptions(filterOptions.departments, filterQuery).map((dept, index) => {
                        const isSelected = selectedDepartments.includes(dept);
                        return (
                          <TouchableOpacity
                            key={index}
                            style={styles.filterItem}
                            onPress={() => toggleDepartmentSelection(dept)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.filterItemLeft}>
                              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                                {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                              </View>
                              <Text style={styles.filterItemText}>{dept}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                )}

                {activeFilterTab === 'options' && (
                  <TouchableOpacity
                    style={styles.filterItem}
                    onPress={() => setFilterInStock(!filterInStock)}
                  >
                    <View style={styles.filterItemLeft}>
                      <View style={[styles.checkbox, filterInStock && styles.checkboxChecked]}>
                        {filterInStock && <Ionicons name="checkmark" size={16} color="#FFF" />}
                      </View>
                      <Text style={styles.filterItemText}>In Stock Only</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </ScrollView>

              {/* Filter Actions */}
              <View style={styles.filterActions}>
                <TouchableOpacity
                  style={styles.filterClearButton}
                  onPress={clearFilters}
                >
                  <Text style={styles.filterClearButtonText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.filterApplyButton}
                  onPress={applyFilters}
                >
                  <LinearGradient
                    colors={Gradients.accent}
                    style={styles.filterApplyGradient}
                  >
                    <Text style={styles.filterApplyButtonText}>
                      Apply {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Cart Bottom Sheet */}
        {sheetOpen && (
          <Pressable style={styles.overlay} onPress={() => toggleSheet(false)} />
        )}
        <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: sheetAnim }] }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Current Return ({itemCount} items)</Text>
            <TouchableOpacity onPress={() => toggleSheet(false)}>
              <Ionicons name="close" size={24} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.sheetContent}>
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={48} color={Colors.neutral[300]} />
                <Text style={styles.emptyCartText}>Your cart is empty</Text>
              </View>
            ) : (
              <FlatList
                data={cart}
                keyExtractor={(item) => item.product.id.toString()}
                style={styles.cartList}
                renderItem={({ item }) => (
                  <CartItem
                    item={item}
                    changeQty={changeQty}
                    removeItem={removeItem}
                    isEditable={appSettings?.order_rate_editable === true || String(appSettings?.order_rate_editable) === 'true'}
                    onPriceChange={handleCartItemPriceChange}
                  />
                )}
              />
            )}
          </View>

          <View style={styles.sheetFooter}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}> {total.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutButton, cart.length === 0 && styles.disabledButton]}
              onPress={handlePlaceOrder}
              disabled={cart.length === 0}
            >
              <LinearGradient
                colors={cart.length > 0 ? Gradients.success : [Colors.neutral[400], Colors.neutral[400]]}
                style={styles.proceedGradient}
              >
                <View style={styles.PlaceOrderButton}>
                  <Text style={styles.checkoutText}>Place Return</Text>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Flying Items Animation Layer */}
        {flyingItems.map(item => (
          <FlyingItem
            key={item.id}
            startX={item.startX}
            startY={item.startY}
            endX={cartPosition.x}
            endY={cartPosition.y}
            onComplete={() => {
              setFlyingItems(prev => prev.filter(i => i.id !== item.id));
              triggerCartAnimation();
            }}
          />
        ))}

        {/* Quantity Selection Modal */}
        <Modal
          visible={!!quantityModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={closeQuantityModal}
          onShow={() => {
            setTimeout(() => {
              quantityInputRef.current?.focus();
            }, 150);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View style={styles.quantityModalOverlay}>
              <View style={[styles.quantityModalContent, { maxHeight: height * 0.85, paddingBottom: 0 }]}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ padding: Spacing.xl, flexGrow: 1 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.quantityModalHeader}>
                    <Text style={styles.quantityModalTitle}>Select Quantity</Text>
                    <TouchableOpacity onPress={closeQuantityModal}>
                      <Ionicons name="close" size={24} color={Colors.text.secondary} />
                    </TouchableOpacity>
                  </View>

                  {selectedProduct && (
                    <>
                      <View style={styles.quantityProductInfo}>
                        <Text style={styles.quantityProductName} numberOfLines={2}>
                          {selectedProduct.name}
                        </Text>
                        {(appSettings?.order_rate_editable === true || String(appSettings?.order_rate_editable) === 'true') ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={{ marginRight: 8 }}>Price:</Text>
                            <TextInput
                              value={tempPrice}
                              onChangeText={setTempPrice}
                              keyboardType="numeric"
                              style={{
                                borderBottomWidth: 1,
                                borderBottomColor: Colors.accent.main,
                                minWidth: 80,
                                textAlign: 'center',
                                fontWeight: '700',
                                fontSize: 16
                              }}
                              selectTextOnFocus={true}
                            />
                          </View>
                        ) : (
                          <Text style={styles.quantityProductPrice}>
                            {(selectedProduct.price || selectedProduct.retail || 0).toFixed(2)} per unit
                          </Text>
                        )}
                      </View>

                      <View style={styles.quantityInputContainer}>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => {
                            const current = parseFloat(tempQuantity) || 1;
                            setTempQuantity(String(Math.max(1, current - 1)));
                          }}
                        >
                          <Ionicons name="remove" size={24} color={Colors.accent.main} />
                        </TouchableOpacity>

                        <TextInput
                          ref={quantityInputRef}
                          style={styles.quantityInput}
                          value={String(tempQuantity)}
                          keyboardType="numeric"
                          onChangeText={(text) => {
                            // Allow decimals
                            const cleaned = text.replace(/[^0-9.]/g, '');
                            // Prevent multiple dots
                            const parts = cleaned.split('.');
                            if (parts.length > 2) return;
                            setTempQuantity(cleaned);
                          }}
                        />

                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => {
                            const current = parseFloat(tempQuantity) || 1;
                            setTempQuantity(String(current + 1));
                          }}
                        >
                          <Ionicons name="add" size={24} color={Colors.accent.main} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.quantityTotalContainer}>
                        <Text style={styles.quantityTotalLabel}>Total:</Text>
                        <Text style={styles.quantityTotalValue}>
                          {((parseFloat(tempQuantity) || 0) * (appSettings?.order_rate_editable ? (parseFloat(tempPrice) || 0) : selectedProduct.price)).toFixed(2)}
                        </Text>
                      </View>

                      {/* Remarks Section */}
                      <View style={styles.remarksContainer}>
                        <Text style={styles.remarksLabel}>Remark (Optional)</Text>

                        {/* Dropdown Trigger */}
                        <TouchableOpacity
                          style={styles.dropdownTrigger}
                          onPress={() => setRemarkDropdownVisible(!remarkDropdownVisible)}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.dropdownTriggerText,
                            selectedRemarkOption === "NONE" && { color: Colors.text.tertiary }
                          ]}>
                            {selectedRemarkOption}
                          </Text>
                          <Ionicons
                            name={remarkDropdownVisible ? "chevron-up" : "chevron-down"}
                            size={20}
                            color={Colors.text.secondary}
                          />
                        </TouchableOpacity>

                        {/* Dropdown Options List */}
                        {remarkDropdownVisible && (
                          <View style={styles.dropdownList}>
                            {REMARK_OPTIONS.map((option) => (
                              <TouchableOpacity
                                key={option}
                                style={[
                                  styles.dropdownItem,
                                  selectedRemarkOption === option && styles.dropdownItemActive
                                ]}
                                onPress={() => {
                                  setSelectedRemarkOption(option);
                                  setRemarkDropdownVisible(false);
                                }}
                              >
                                <Text style={[
                                  styles.dropdownItemText,
                                  selectedRemarkOption === option && styles.dropdownItemTextActive
                                ]}>
                                  {option}
                                </Text>
                                {selectedRemarkOption === option && (
                                  <Ionicons name="checkmark" size={18} color={Colors.accent.main} />
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}

                        <TextInput
                          style={[styles.remarkInput, { marginTop: 12 }]}
                          placeholder="Add manual remark..."
                          placeholderTextColor={Colors.text.tertiary}
                          value={tempRemark}
                          onChangeText={setTempRemark}
                        />
                      </View>


                      <TouchableOpacity
                        style={styles.quantityConfirmButton}
                        onPress={handleConfirmQuantity}
                      >
                        <LinearGradient
                          colors={Gradients.success}
                          style={styles.quantityConfirmGradient}
                        >
                          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                          <Text style={styles.quantityConfirmText}>Add to Cart</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Image Modal */}
        <Modal
          visible={!!imageModalVisible}
          transparent={true}
          onRequestClose={closeImageModal}
        >
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity style={styles.closeModalButton} onPress={closeImageModal}>
              <Ionicons name="close" size={30} color="#FFF" />
            </TouchableOpacity>
            {selectedImage && selectedImage.length > 0 && (
              <Image
                source={{ uri: selectedImage[currentImageIndex].url }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>

        {/* Customer Selection Modal */}
        <Modal
          visible={!!showCustomerModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowCustomerModal(false)}
        >
          <View style={styles.customerModalOverlay}>
            <View style={styles.customerModalContent}>
              <View style={styles.customerModalHeader}>
                <Text style={styles.customerModalTitle}>Change Customer</Text>
                <TouchableOpacity onPress={() => setShowCustomerModal(false)} style={styles.customerCloseBtn}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.customerSearchContainer}>
                <Ionicons name="search" size={20} color={Colors.text.tertiary} style={styles.customerSearchIcon} />
                <TextInput
                  style={styles.customerSearchInput}
                  placeholder="Search name or code..."
                  placeholderTextColor={Colors.text.tertiary}
                  value={customerSearchQuery}
                  onChangeText={setCustomerSearchQuery}
                />
              </View>

              <FlatList
                data={filteredCustomers}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.customerListItem}
                    onPress={() => handleSelectCustomer(item)}
                  >
                    <View style={styles.customerListAvatar}>
                      <Text style={styles.customerAvatarText}>{item.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.customerListInfo}>
                      <Text style={styles.customerListItemName}>{item.name}</Text>
                      <Text style={styles.customerListItemCode}>Code: {item.code} • {item.place || item.area}</Text>
                    </View>
                    {currentCustomerCode === item.code && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.accent.main} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.customerEmptyContainer}>
                    <Text style={styles.customerEmptyText}>No customers found</Text>
                  </View>
                }
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>

        {/* Batch Details Modal */}
        <Modal
          visible={!!detailsModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={closeDetailsModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsModalContent}>
              <View style={styles.modalHandleContainer}>
                <View style={styles.modalHandle} />
              </View>

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Product Details</Text>
                <TouchableOpacity onPress={closeDetailsModal} style={styles.closeModalCircle}>
                  <Ionicons name="close" size={20} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailsScrollContent}>
                {selectedBatchDetails && (
                  <>
                    {/* Image Carousel */}
                    {selectedBatchDetails.photos && selectedBatchDetails.photos.length > 0 && (
                      <View style={styles.detailsImageContainer}>
                        <Image
                          source={{ uri: selectedBatchDetails.photos[currentPhotoIndex].url }}
                          style={styles.detailsImage}
                          resizeMode="contain"
                        />
                        {selectedBatchDetails.photos.length > 1 && (
                          <>
                            {currentPhotoIndex > 0 && (
                              <TouchableOpacity
                                style={[styles.photoNavButton, styles.photoNavLeft]}
                                onPress={() => setCurrentPhotoIndex(currentPhotoIndex - 1)}
                              >
                                <Ionicons name="chevron-back" size={24} color="#FFF" />
                              </TouchableOpacity>
                            )}
                            {currentPhotoIndex < selectedBatchDetails.photos.length - 1 && (
                              <TouchableOpacity
                                style={[styles.photoNavButton, styles.photoNavRight]}
                                onPress={() => setCurrentPhotoIndex(currentPhotoIndex + 1)}
                              >
                                <Ionicons name="chevron-forward" size={24} color="#FFF" />
                              </TouchableOpacity>
                            )}

                            <View style={styles.imageCountBadge}>
                              <Text style={styles.imageCountText}>
                                {currentPhotoIndex + 1}/{selectedBatchDetails.photos.length}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    )}

                    {/* Product Info */}
                    <View style={styles.detailsInfoCard}>
                      <Text style={styles.detailsProductName}>{selectedBatchDetails.name}</Text>
                      <View style={styles.detailsMetaRow}>
                        <View style={styles.detailsMetaChip}>
                          <Text style={styles.detailsMetaLabel}>Code:</Text>
                          <Text style={styles.detailsMetaValue}>{selectedBatchDetails.code}</Text>
                        </View>
                        {selectedBatchDetails.brand && (
                          <View style={styles.detailsMetaChip}>
                            <Text style={styles.detailsMetaValue}>{selectedBatchDetails.brand}</Text>
                          </View>
                        )}
                        <View style={[styles.detailsMetaChip, { backgroundColor: Colors.neutral[100] }]}>
                          <Text style={styles.detailsMetaLabel}>GST:</Text>
                          <Text style={styles.detailsMetaValue}>{selectedBatchDetails.taxcode || '0'}{selectedBatchDetails.taxcode ? '%' : ''}</Text>
                        </View>

                        {selectedBatchDetails.text6 && (
                          <View style={[styles.detailsMetaChip, { backgroundColor: Colors.neutral[100] }]}>
                            <Text style={styles.detailsMetaLabel}>HSN:</Text>
                            <Text style={styles.detailsMetaValue}>{selectedBatchDetails.text6}</Text>
                          </View>
                        )}
                      </View>
                      {selectedBatchDetails.barcode && (
                        <View style={styles.barcodeContainer}>
                          <Ionicons name="barcode-outline" size={16} color={Colors.text.secondary} />
                          <Text style={styles.detailsBarcode}>{selectedBatchDetails.barcode}</Text>
                        </View>
                      )}
                    </View>

                    {/* Price Information */}
                    <View style={styles.detailsSection}>
                      <Text style={styles.detailsSectionTitle}>Price Details</Text>
                      <View style={styles.priceGrid}>
                        {selectedBatchDetails.prices && selectedBatchDetails.prices.length > 0 ? (
                          // Dynamic Price Rendering from API Data
                          selectedBatchDetails.prices.map((priceObj, index) => {
                            // 1. Visibility Check (Deny List)
                            const restrictedCodes = selectedBatchDetails.restrictedCodes;
                            const isRestricted = restrictedCodes?.includes(priceObj.price_code);

                            if (isRestricted) return null;

                            // 2. Value Check (Hide if 0)
                            if (parseFloat(priceObj.value || 0) <= 0) return null;

                            // 2. Effective Price Highlight
                            // Match against priceCodeUsed (which holds the code like 'S2', 'S1')
                            const effectiveCode = selectedBatchDetails.priceCodeUsed || 'S2';
                            const isEffective = effectiveCode === priceObj.price_code;

                            return (
                              <View key={index} style={[styles.priceItem, isEffective && styles.priceItemHighlight]}>
                                <Text style={[styles.priceLabel, isEffective && { color: Colors.accent.main }]}>
                                  {priceObj.price_name} ({priceObj.price_code})
                                </Text>
                                <Text style={[styles.priceValue, isEffective && { color: Colors.accent.main }]}>
                                  {parseFloat(priceObj.value || 0).toFixed(2)}
                                </Text>
                              </View>
                            );
                          })
                        ) : (
                          // Fallback for Legacy/Missing Data (Hardcoded common fields)
                          <>
                            {selectedBatchDetails.mrp > 0 && !selectedBatchDetails.restrictedCodes?.includes('MR') && (
                              <View style={styles.priceItem}>
                                <Text style={styles.priceLabel}>MRP</Text>
                                <Text style={styles.priceValue}>{selectedBatchDetails.mrp?.toFixed(2)}</Text>
                              </View>
                            )}
                            {selectedBatchDetails.price > 0 && !selectedBatchDetails.restrictedCodes?.includes(selectedBatchDetails.priceCodeUsed || 'S2') && (
                              <View style={[styles.priceItem, styles.priceItemHighlight]}>
                                <Text style={[styles.priceLabel, { color: Colors.accent.main }]}>Rate ({selectedBatchDetails.priceCodeUsed || 'S2'})</Text>
                                <Text style={[styles.priceValue, { color: Colors.accent.main }]}>{selectedBatchDetails.price?.toFixed(2)}</Text>
                              </View>
                            )}
                            {selectedBatchDetails.retail > 0 && !selectedBatchDetails.restrictedCodes?.includes('S2') && (
                              <View style={styles.priceItem}>
                                <Text style={styles.priceLabel}>Retail</Text>
                                <Text style={styles.priceValue}>{selectedBatchDetails.retail?.toFixed(2)}</Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    </View>

                    {/* Stock Information */}
                    <View style={styles.detailsSection}>
                      <Text style={styles.detailsSectionTitle}>Stock Status</Text>
                      <View style={styles.stockCard}>
                        <View style={styles.stockRow}>
                          <View style={styles.stockIconContainer}>
                            <Ionicons name="cube" size={20} color={selectedBatchDetails.stock > 0 ? Colors.success.main : Colors.error.main} />
                          </View>
                          <View>
                            <Text style={styles.stockLabel}>Total Stock</Text>
                            <Text style={[styles.stockValue, { color: selectedBatchDetails.stock > 0 ? Colors.success.main : Colors.error.main }]}>
                              {selectedBatchDetails.stock || 0} {selectedBatchDetails.unit}
                            </Text>
                          </View>
                        </View>

                        {selectedBatchDetails.expiryDate && selectedBatchDetails.expiryDate !== '1900-01-01' && (
                          <View style={[styles.stockRow, { borderTopWidth: 1, borderTopColor: Colors.neutral[100], paddingTop: 12, marginTop: 12 }]}>
                            <View style={[styles.stockIconContainer, { backgroundColor: Colors.warning[50] }]}>
                              <Ionicons name="calendar" size={20} color={Colors.warning.main} />
                            </View>
                            <View>
                              <Text style={styles.stockLabel}>Expiry Date</Text>
                              <Text style={styles.stockValueSimple}>{selectedBatchDetails.expiryDate}</Text>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Godown Stock Display */}
                      {selectedBatchDetails.goddowns && selectedBatchDetails.goddowns.length > 0 && (
                        <View style={{ marginTop: 20 }}>
                          <Text style={styles.subSectionTitle}>Godown Breakdown</Text>
                          {selectedBatchDetails.goddowns.map((godown, index) => (
                            <View key={index} style={styles.goddownItem}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="business" size={16} color={Colors.text.tertiary} />
                                <Text style={styles.goddownName}>{godown.name}</Text>
                              </View>
                              <View style={styles.godownBadge}>
                                <Text style={styles.goddownQty}>{godown.quantity} {selectedBatchDetails.unit}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Remark/Note Selection Modal */}
        <Modal
          visible={remarkModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setRemarkModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setRemarkModalVisible(false)}
          >
            <View style={styles.remarkModalContent}>
              <View style={styles.remarkModalHeader}>
                <Text style={styles.remarkModalTitle}>Select Remark</Text>
                <TouchableOpacity onPress={() => setRemarkModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.secondary} />
                </TouchableOpacity>
              </View>
              {REMARK_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.remarkOptionItem}
                  onPress={() => {
                    setEditingRemarks(prev => ({ ...prev, [activeRemarkProductId]: option }));
                    setRemarkModalVisible(false);
                  }}
                >
                  <Text style={styles.remarkOptionText}>{option}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.neutral[300]} />
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView >
    </LinearGradient >
  );
}

// Separated Component for better performance
const CodeItemBase = ({ item, inStock, stockQty, gStock, currentQty, displayValue, isInCart, isHighlighted, setEditingQty, changeQty, removeItem, addToCart, openImageModal, openDetailsModal, defaultQuantity, editingQty, editingRemarks, setEditingRemarks, openRemarkModal, cartPrice }) => (
  <View style={[
    styles.productCard,
    isInCart && styles.productCardInCart,
    isHighlighted && styles.productCardHighlighted
  ]}>
    <View style={styles.productContainer}>
      <TouchableOpacity onPress={() => openImageModal(item.photos)}>
        {item.photos && item.photos.length > 0 ? (
          <Image source={{ uri: item.photos[0].url }} style={styles.productImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="image-outline" size={24} color={Colors.neutral[400]} />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.productInfo}>
        <View style={styles.productHeader}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        </View>

        <Text style={styles.productMeta}>Code: {item.code} {item.unit ? `• ${item.unit}` : ''}</Text>
        {item.barcode && item.barcode !== item.code && (
          <Text style={styles.productBarcode}>Barcode: {item.barcode}</Text>
        )}
        {item.brand && <Text style={styles.productBrand}>{item.brand}</Text>}

        <View style={styles.priceColumn}>
          {item.mrp > 0 && !item.restrictedCodes?.includes('MR') && (
            <Text style={styles.mrpLabel}>MRP: {item.mrp.toFixed(2)}</Text>
          )}
          {!item.restrictedCodes?.includes(item.priceCodeUsed || 'S2') && (
            <View>
              <Text style={[styles.price, isInCart && cartPrice !== undefined && cartPrice !== item.price && { textDecorationLine: 'line-through', fontSize: 12, opacity: 0.6 }]}>
                Price: {item.price ? item.price.toFixed(2) : '0.00'}
              </Text>
              {isInCart && cartPrice !== undefined && cartPrice !== item.price && (
                <Text style={[styles.price, { color: Colors.accent.main, marginTop: -2 }]}>
                  Rate: {cartPrice.toFixed(2)}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </View>

    {/* New Bottom Section */}
    <View style={styles.productBottomSection}>
      {/* Row for Stock and Details */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        {/* Stock Display */}
        <View style={styles.stockDisplayContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.stockLabel}>Stock:</Text>
            <Text style={[styles.stockCount, stockQty === 0 && styles.outOfStockText]}>
              {stockQty}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
            <Text style={styles.stockLabel}>G.Stock:</Text>
            <Text style={[styles.stockCount, gStock === 0 && styles.outOfStockText]}>
              {gStock}
            </Text>
          </View>
        </View>

        {/* Details Link - Now inline with stock */}
        <TouchableOpacity
          onPress={() => openDetailsModal(item)}
          style={styles.detailsLinkButton}
        >
          <Text style={styles.detailsLinkText}>View Details</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.accent.main} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionsContainer}>
        {/* Action Buttons */}
        {currentQty > 0 ? (
          <View style={styles.qtyControlLarge}>
            <TouchableOpacity
              style={styles.qtyBtnLarge}
              onPress={(e) => changeQty(item.id, currentQty - 1, e)}
            >
              <Ionicons name="remove" size={24} color={Colors.text.primary} />
            </TouchableOpacity>

            <TextInput
              style={styles.qtyInputLarge}
              value={displayValue}
              keyboardType="numeric"
              selectTextOnFocus={true}
              onFocus={() => {
                setEditingQty(prev => ({ ...prev, [item.id]: String(currentQty) }));
              }}
              onBlur={() => {
                setEditingQty(prev => {
                  const newState = { ...prev };
                  delete newState[item.id];
                  return newState;
                });
                if (currentQty === 0) changeQty(item.id, 1);
              }}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, '');
                // Prevent multiple dots
                const parts = cleaned.split('.');
                if (parts.length > 2) return;

                setEditingQty(prev => ({ ...prev, [item.id]: cleaned }));
                if (cleaned !== "" && cleaned !== ".") {
                  const num = parseFloat(cleaned);
                  if (!isNaN(num)) changeQty(item.id, num);
                }
              }}
            />

            <TouchableOpacity
              style={styles.qtyBtnLarge}
              onPress={(e) => changeQty(item.id, currentQty + 1, e)}
            >
              <Ionicons name="add" size={24} color={Colors.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => removeItem(item.id)}
              style={styles.removeBtnLarge}
            >
              <Ionicons name="trash-outline" size={24} color={Colors.error.main} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: '100%' }}>
            {/* Row 1: Quantity and Add Button */}
            <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 4, height: 44, width: '100%', marginBottom: 8 }}>
              {/* Minus Button */}
              <TouchableOpacity
                style={[styles.qtyBtnLarge, { width: 36, height: 44, borderRadius: BorderRadius.md, backgroundColor: Colors.neutral[50] }]}
                onPress={() => {
                  const currentStr = editingQty[item.id] !== undefined ? String(editingQty[item.id]) : String(defaultQuantity !== undefined ? defaultQuantity : 1);
                  const currentVal = parseFloat(currentStr);
                  const newVal = Math.max(0, (isNaN(currentVal) ? 0 : currentVal) - 1);
                  setEditingQty(prev => ({ ...prev, [item.id]: String(newVal) }));
                }}
              >
                <Ionicons name="remove" size={20} color={Colors.text.primary} />
              </TouchableOpacity>

              {/* Quantity Input for not-in-cart items */}
              <TextInput
                style={{
                  flex: 0.25,
                  borderWidth: 1,
                  borderColor: Colors.border.medium,
                  borderRadius: BorderRadius.md,
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: '600',
                  color: Colors.text.primary,
                  backgroundColor: '#FFF'
                }}
                value={editingQty[item.id] !== undefined ? String(editingQty[item.id]) : String(defaultQuantity !== undefined ? defaultQuantity : 1)}
                keyboardType="numeric"
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  if (parts.length > 2) return;
                  setEditingQty(prev => ({ ...prev, [item.id]: cleaned }));
                }}
                onFocus={() => {
                  setEditingQty(prev => ({ ...prev, [item.id]: prev[item.id] !== undefined ? String(prev[item.id]) : String(defaultQuantity !== undefined ? defaultQuantity : 1) }));
                }}
                onBlur={() => {
                  setEditingQty(prev => {
                    const newState = { ...prev };
                    if (!newState[item.id] || isNaN(parseFloat(newState[item.id])) || (parseFloat(newState[item.id]) < 0)) {
                      newState[item.id] = String(defaultQuantity !== undefined ? defaultQuantity : 1);
                    }
                    return newState;
                  });
                }}
              />

              {/* Plus Button */}
              <TouchableOpacity
                style={[styles.qtyBtnLarge, { width: 36, height: 44, borderRadius: BorderRadius.md, backgroundColor: Colors.neutral[50] }]}
                onPress={() => {
                  const currentStr = editingQty[item.id] !== undefined ? String(editingQty[item.id]) : String(defaultQuantity !== undefined ? defaultQuantity : 1);
                  const currentVal = parseFloat(currentStr);
                  const newVal = (isNaN(currentVal) ? 0 : currentVal) + 1;
                  setEditingQty(prev => ({ ...prev, [item.id]: String(newVal) }));
                }}
              >
                <Ionicons name="add" size={20} color={Colors.text.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addButtonLarge, (inStock === false) && styles.disabledAddButton, { flex: 0.5, marginLeft: 4, height: '100%', marginTop: 0 }]}
                onPress={(e) => {
                  const qtyStr = editingQty[item.id] !== undefined ? String(editingQty[item.id]) : String(defaultQuantity !== undefined ? defaultQuantity : 1);
                  const qtyVal = parseFloat(qtyStr);
                  const finalQty = (!isNaN(qtyVal) && qtyVal >= 0) ? qtyVal : (defaultQuantity !== undefined ? defaultQuantity : 1);
                  addToCart(item, finalQty);
                  setEditingQty(prev => {
                    const newState = { ...prev };
                    delete newState[item.id];
                    return newState;
                  });
                }}
                disabled={inStock === false}
              >
                <LinearGradient
                  colors={inStock ? Gradients.accent : [Colors.neutral[200], Colors.neutral[200]]}
                  style={[styles.addButtonGradient, { height: '100%', paddingVertical: 0, justifyContent: 'center' }]}
                >
                  <Ionicons name="cart-outline" size={18} color={inStock ? '#FFF' : Colors.text.tertiary} />
                  <Text style={[styles.addButtonTextLarge, (inStock === false) && { color: Colors.text.tertiary }, { fontSize: 13, marginLeft: 4 }]}>
                    {inStock ? 'Add to Cart' : 'Out of Stock'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Row 2: Note with Selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 44 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border.medium, borderRadius: BorderRadius.md, backgroundColor: '#FFF', height: '100%' }}>
                <TextInput
                  style={{
                    flex: 1,
                    paddingHorizontal: 8,
                    fontSize: 13,
                    color: Colors.text.primary,
                    height: '100%'
                  }}
                  placeholder="Return Note/Remark..."
                  placeholderTextColor={Colors.text.tertiary}
                  value={editingRemarks[item.id] || ""}
                  onChangeText={(text) => {
                    setEditingRemarks(prev => ({ ...prev, [item.id]: text }));
                  }}
                />
                <TouchableOpacity
                  onPress={() => openRemarkModal(item.id)}
                  style={{ padding: 10, borderLeftWidth: 1, borderLeftColor: Colors.border.light }}
                >
                  <Ionicons name="chevron-down-circle" size={20} color={Colors.accent.main} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  </View >
);

// Memoize CodeItem to prevent redundant re-renders
const CodeItem = React.memo(CodeItemBase, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.currentQty === nextProps.currentQty &&
    prevProps.displayValue === nextProps.displayValue &&
    prevProps.isInCart === nextProps.isInCart &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.inStock === nextProps.inStock &&
    prevProps.stockQty === nextProps.stockQty &&
    prevProps.gStock === nextProps.gStock &&
    prevProps.cartPrice === nextProps.cartPrice &&
    prevProps.editingRemarks?.[prevProps.item.id] === nextProps.editingRemarks?.[nextProps.item.id]
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginTop: 35,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    color: Colors.text.primary,
  },
  backButton: { padding: 4 },

  content: { flex: 1, paddingHorizontal: Spacing.lg },

  customerCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  customerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  customerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  customerInitial: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  customerName: { fontSize: Typography.sizes.base, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  customerDetails: { fontSize: Typography.sizes.sm, color: 'rgba(255,255,255,0.9)' },

  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  actionIconButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
    position: 'relative',
  },
  actionIconButtonActive: {
    backgroundColor: Colors.accent.main,
    borderColor: Colors.accent.main,
  },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: Colors.error.main,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: Colors.error.main,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  searchContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  searchInput: { flex: 1, marginLeft: Spacing.sm, fontSize: Typography.sizes.base, color: Colors.text.primary },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  searchGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  activeFiltersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  activeFiltersLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  activeFiltersList: {
    flex: 1,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent[50],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
    gap: 4,
    maxWidth: 120,
  },
  activeFilterChipText: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent.main,
    fontWeight: '600',
  },
  clearFiltersBtn: {
    paddingHorizontal: Spacing.sm,
  },
  clearFiltersBtnText: {
    fontSize: Typography.sizes.xs,
    color: Colors.error.main,
    fontWeight: '600',
  },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: Colors.text.secondary },

  listContent: { paddingBottom: 100 },

  productCard: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  productCardInCart: {
    backgroundColor: '#E8F5E9',
    borderColor: '#81C784',
    borderWidth: 2,
  },
  productCardHighlighted: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
    borderWidth: 3,
    ...Shadows.colored.primary,
  },
  productContainer: { flexDirection: 'row', gap: Spacing.md },
  productImage: { width: 95, height: 90, borderRadius: BorderRadius.md, backgroundColor: Colors.neutral[50] },
  placeholderImage: { width: 95, height: 90, borderRadius: BorderRadius.md, backgroundColor: Colors.neutral[100], justifyContent: 'center', alignItems: 'center' },
  productInfo: { flex: 1 },
  productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  productName: { fontSize: Typography.sizes.sm, fontWeight: '600', color: Colors.text.primary, flex: 1, marginRight: 8 },
  stockBadge: {
    backgroundColor: Colors.success[50],
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  outOfStockBadge: { backgroundColor: Colors.error[50] },
  stockText: { fontSize: 9, fontWeight: '700', color: Colors.success.main },
  outOfStockText: { color: Colors.error.main },
  productMeta: { fontSize: 10, color: Colors.text.tertiary, marginTop: 1 },
  productBrand: { fontSize: 10, color: Colors.text.secondary, fontStyle: 'italic', marginBottom: 2 },
  productBarcode: { fontSize: 10, color: Colors.text.secondary, marginTop: 1 },
  priceColumn: {
    marginTop: 2,
  },
  mrpLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.accent.main,
    marginBottom: 0,
  },
  price: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.accent.main,
  },

  productActions: { marginTop: 4, flexDirection: 'row', justifyContent: 'flex-end' },
  addButton: {
    backgroundColor: Colors.accent[50],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  disabledAddButton: { backgroundColor: Colors.neutral[100] },
  addButtonText: { color: Colors.accent.main, fontWeight: '600', fontSize: 10 },

  qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.neutral[50], borderRadius: BorderRadius.md },
  qtyBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  qtyInput: { width: 32, textAlign: 'center', fontSize: Typography.sizes.sm, fontWeight: '600', color: Colors.text.primary },

  productBottomSection: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[50],
  },
  detailsLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailsLinkText: {
    fontSize: 10,
    color: Colors.accent.main,
    fontWeight: '600',
    marginLeft: 2,
  },
  actionsContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  stockDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 2,
  },
  stockLabel: {
    fontSize: 10,
    color: Colors.text.secondary,
  },
  stockCount: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.success.main,
  },
  addButtonLarge: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadows.sm,
    width: '100%',
  },
  addButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  addButtonTextLarge: {
    color: '#FFF',
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
  },
  qtyControlLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  qtyBtnLarge: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.sm,
    ...Shadows.sm,
  },
  qtyInputLarge: {
    minWidth: 60,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    height: 48,
    textAlignVertical: 'center', // Android vertical centering
    paddingVertical: 0, // Remove default padding
    includeFontPadding: false,
    paddingHorizontal: 4,
  },
  removeBtnLarge: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },

  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  emptyIconContainer: { marginBottom: Spacing.md },
  emptyStateTitle: { fontSize: Typography.sizes.lg, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  emptyStateText: { fontSize: Typography.sizes.sm, color: Colors.text.secondary, textAlign: 'center', maxWidth: '80%', marginBottom: Spacing.xl },
  scanActionBtn: { borderRadius: BorderRadius.full, overflow: 'hidden', ...Shadows.colored.primary },
  scanActionGradient: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: 8 },
  scanActionText: { color: '#FFF', fontWeight: '700' },
  refreshActionBtn: { marginTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshActionText: { color: Colors.accent.main, fontWeight: '600' },

  // Filter Modal
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    height: '80%',
    paddingTop: Spacing.lg,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterModalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  filterInfo: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  filterInfoText: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.neutral[50],
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: Colors.accent.main,
  },
  filterTabText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  filterSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    height: 40,
    marginBottom: Spacing.md,
  },
  filterSearchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },
  filterList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  noResultsContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.tertiary,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  filterItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.neutral[300],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.accent.main,
    borderColor: Colors.accent.main,
  },
  filterItemText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    flex: 1,
  },
  filterItemCount: {
    paddingHorizontal: 8,
    borderRadius: 4,
  },

  // Remark Modal Styles
  remarkModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'] || 40, // Increased padding to clear navigation bar
    width: '100%',
    ...Shadows.lg,
  },
  remarkModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  remarkModalTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  remarkOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  remarkOptionText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterItemCountText: {
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 30,
    textAlign: 'center',
  },
  filterActions: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'], // Extra padding for phone's navigation bar
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
  },
  filterClearButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.accent.main,
    alignItems: 'center',
  },
  filterClearButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.accent.main,
  },
  filterApplyButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  filterApplyGradient: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  filterApplyButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: '#FFF',
  },

  // Bottom Sheet
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: height * 0.7,
    backgroundColor: '#FFF',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    zIndex: 101,
    ...Shadows.xl,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  sheetTitle: { fontSize: Typography.sizes.lg, fontWeight: '700', color: Colors.text.primary },
  sheetContent: { flex: 1 },
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCartText: { marginTop: Spacing.md, color: Colors.text.tertiary, fontSize: Typography.sizes.base },
  cartList: { padding: Spacing.md },
  cartItem: { flexDirection: 'column', marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: Typography.sizes.base, fontWeight: '700', color: Colors.text.primary, flex: 1, marginRight: 10 },
  cartItemPrice: { fontSize: Typography.sizes.sm, color: Colors.text.secondary },
  cartItemTotal: { fontSize: Typography.sizes.base, fontWeight: '600', color: Colors.accent.main, marginHorizontal: Spacing.md },
  removeCartItem: { padding: 4 },

  sheetFooter: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border.light },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  totalLabel: { fontSize: Typography.sizes.lg, color: Colors.text.secondary },
  totalValue: { fontSize: Typography.sizes.xl, fontWeight: '700', color: Colors.text.primary },
  checkoutButton: { borderRadius: BorderRadius.full, overflow: 'hidden', ...Shadows.colored.success },
  proceedGradient: { paddingVertical: Spacing.md },
  checkoutText: { color: '#FFF', fontSize: Typography.sizes.lg, fontWeight: '700' },
  disabledButton: { opacity: 0.6, ...Shadows.none },
  PlaceOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    gap: 8,
  },

  // Quantity Modal - FIXED for resizing
  quantityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center', // Center specifically
    padding: Spacing.md,
  },
  quantityModalContent: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius['2xl'],
    width: '100%',
    maxWidth: 400,
    padding: Spacing.xl,
    ...Shadows.xl,
    // Ensure it doesn't get too squeezed
    minHeight: 300,
  },
  quantityModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  quantityModalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  quantityProductInfo: {
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  quantityProductName: {
    fontSize: Typography.sizes.lg,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  quantityProductPrice: {
    fontSize: Typography.sizes.base,
    color: Colors.text.secondary,
  },
  quantityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  quantityButton: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityInput: {
    width: 140,
    height: 60,
    borderWidth: 2,
    borderColor: Colors.accent.main,
    borderRadius: BorderRadius.lg,
    textAlign: 'center',
    fontSize: Typography.sizes['2xl'],
    fontWeight: '700',
    color: Colors.text.primary,
  },
  quantityTotalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  quantityTotalLabel: {
    fontSize: Typography.sizes.lg,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  quantityTotalValue: {
    fontSize: Typography.sizes['2xl'],
    fontWeight: '700',
    color: Colors.accent.main,
  },
  quantityConfirmButton: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    ...Shadows.colored.success,
    
  },
  quantityConfirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: 8,
  },
  quantityConfirmText: {
    color: '#FFF',
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
  },

  // Image Modal
  imageModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeModalButton: { position: 'absolute', top: 40, right: 20, padding: 10, zIndex: 1 },
  fullImage: { width: width, height: height * 0.8 },

  // Details Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  detailsModalContent: {
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    paddingBottom: Spacing.xl,
    ...Shadows.xl,
  },
  modalHandleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.neutral[300],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  closeModalCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsScrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },


  detailsImageContainer: {
    width: '100%',
    height: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: Spacing.lg,
    position: 'relative',
    overflow: 'hidden',
    ...Shadows.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  detailsImage: {
    width: '90%',
    height: '90%',
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCountText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  photoNavButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -20 }],
    backgroundColor: 'rgba(255,255,255,0.9)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Shadows.sm,
  },
  photoNavLeft: {
    left: 10,
  },
  photoNavRight: {
    right: 10,
  },

  detailsInfoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  detailsProductName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 8,
    lineHeight: 28,
  },
  detailsMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  detailsMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  detailsMetaLabel: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginRight: 4,
    fontWeight: '600',
  },
  detailsMetaValue: {
    fontSize: 11,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  barcodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailsBarcode: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  detailsSection: {
    marginBottom: Spacing.xl,
  },
  detailsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
    marginLeft: 4,
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  priceItem: {
    width: '31%', // 3 columns
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 14,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
    ...Shadows.sm,
  },
  priceItemHighlight: {
    backgroundColor: Colors.accent[50],
    borderColor: Colors.primary[200],
  },
  priceLabel: {
    fontSize: 10,
    color: Colors.text.secondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
  },

  stockCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    ...Shadows.sm,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stockIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.success[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  stockValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  stockValueSimple: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },

  subSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.tertiary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goddownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  goddownName: {
    fontSize: 13,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  godownBadge: {
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  goddownQty: {
    fontSize: 13,
    color: Colors.accent.main,
    fontWeight: '700',
  },
  cartItemRemark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  cartItemRemarkText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },
  remarksContainer: {
    marginBottom: Spacing.xl,
    width: '100%',
  },
  remarksLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  remarkOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  remarkOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.neutral[100],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  remarkOptionChipActive: {
    backgroundColor: Colors.accent.main,
    borderColor: Colors.accent.main,
  },
  remarkOptionText: {
    fontSize: 12,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  remarkOptionTextActive: {
    color: '#FFF',
  },
  remarkInput: {
    width: '100%',
    height: 45,
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
    color: Colors.text.primary,
    backgroundColor: Colors.neutral[50],
  },
  dropdownTrigger: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.neutral[50],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  dropdownList: {
    width: '100%',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    marginTop: 4,
    overflow: 'hidden',
    ...Shadows.md,
    position: 'absolute',
    top: 75, // Below label and trigger
    zIndex: 1000,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[50],
  },
  dropdownItemActive: {
    backgroundColor: Colors.accent[50],
  },
  dropdownItemText: {
    fontSize: 14,
    color: Colors.text.primary,
  },
  dropdownItemTextActive: {
    fontSize: 14,
    color: Colors.accent.main,
  },

  // Customer Selection Modal Styles
  customerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    zIndex: 999,
  },
  customerModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    width: '100%',
    maxWidth: 500,
    maxHeight: '70%',
    padding: Spacing.lg,
    ...Shadows.xl,
  },
  customerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  customerModalTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  customerCloseBtn: {
    padding: 4,
  },
  customerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  customerSearchIcon: {
    marginRight: Spacing.sm,
  },
  customerSearchInput: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    paddingVertical: 0,
  },
  customerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[50],
  },
  customerListAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  customerAvatarText: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: Colors.accent.main,
  },
  customerListInfo: {
    flex: 1,
  },
  customerListItemName: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  customerListItemCode: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  customerEmptyContainer: {
    padding: Spacing.xl * 2,
    alignItems: 'center',
  },
  customerEmptyText: {
    color: Colors.text.tertiary,
    fontSize: Typography.sizes.base,
    fontWeight: '600',
  },
});
