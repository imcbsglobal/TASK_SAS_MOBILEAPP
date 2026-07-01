// app/Expense/ExpenseEntry.js
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  View,
} from 'react-native';
import { BorderRadius, Colors, Gradients, Spacing, Typography } from '../../constants/theme';

// Icon/colour palette cycled for API-sourced categories
const CATEGORY_PALETTE = [
  { icon: 'car-outline',                          color: '#6366F1' },
  { icon: 'fast-food-outline',                    color: '#F97316' },
  { icon: 'briefcase-outline',                    color: '#06B6D4' },
  { icon: 'flash-outline',                        color: '#F59E0B' },
  { icon: 'bed-outline',                          color: '#8B5CF6' },
  { icon: 'call-outline',                         color: '#10B981' },
  { icon: 'musical-notes-outline',                color: '#EC4899' },
  { icon: 'ellipsis-horizontal-circle-outline',   color: '#6B7280' },
  { icon: 'cart-outline',                         color: '#EF4444' },
  { icon: 'medkit-outline',                       color: '#14B8A6' },
  { icon: 'school-outline',                       color: '#F472B6' },
  { icon: 'construct-outline',                    color: '#A78BFA' },
];

export default function ExpenseEntryScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Categories from API ──────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch('https://tasksas.com/api/expense-master/list/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      // API may return an array directly or { results: [...] }
      const rawList = Array.isArray(data) ? data : (data.results || data.data || []);
      // Map each item to a display object, cycling through the palette
      const mapped = rawList.map((item, idx) => ({
        label: item.expense_name || item.name || item.category_name || String(item),
        ...CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
      }));
      setCategories(mapped);
    } catch (e) {
      console.error('[ExpenseEntry] fetchCategories error:', e);
      setCategoriesError('Failed to load categories. Tap to retry.');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCategories();
    }, [fetchCategories])
  );

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handlePost = async () => {
    if (!selectedCategory) {
      triggerShake();
      Alert.alert('Missing Category', 'Please select an expense category.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');

      const response = await fetch('https://tasksas.com/api/expense-tracker/mobile/add/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expense_name: selectedCategory.label,
          amount: parsedAmount.toFixed(3),
          remark: note.trim(),
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[ExpenseEntry] POST failed:', response.status, errBody);
        throw new Error(`Server error ${response.status}`);
      }

      Alert.alert(
        '✅ Expense Posted',
        `${parsedAmount.toFixed(3)} for "${selectedCategory.label}" recorded successfully.`,
        [
          {
            text: 'Add Another',
            onPress: () => {
              setSelectedCategory(null);
              setAmount('');
              setNote('');
            },
          },
          {
            text: 'Go Back',
            style: 'cancel',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to post expense. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Expense</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* Hero Banner */}
            <LinearGradient
              colors={['#6366F1', '#8B5CF6', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroBanner}
            >
              <View style={styles.heroBannerIcon}>
                <Ionicons name="receipt-outline" size={36} color="#fff" />
              </View>
              <Text style={styles.heroBannerTitle}>Expense Entry</Text>
              <Text style={styles.heroBannerSubtitle}>Record your expense quickly and accurately</Text>
            </LinearGradient>

            {/* Form Card */}
            <View style={styles.formCard}>

              {/* Category Field */}
              <Text style={styles.fieldLabel}>
                Category <Text style={styles.required}>*</Text>
              </Text>
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                <TouchableOpacity
                  style={[
                    styles.dropdownBox,
                    selectedCategory && { borderColor: Colors.primary.main, borderWidth: 2 }
                  ]}
                  onPress={() => setShowCategoryModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownLeft}>
                    <View style={[
                      styles.categoryIconBox,
                      { backgroundColor: selectedCategory ? selectedCategory.color + '20' : Colors.neutral[100] }
                    ]}>
                      <Ionicons
                        name={selectedCategory ? selectedCategory.icon : 'grid-outline'}
                        size={20}
                        color={selectedCategory ? selectedCategory.color : Colors.text.tertiary}
                      />
                    </View>
                    <Text style={[
                      styles.dropdownText,
                      !selectedCategory && styles.dropdownPlaceholder
                    ]}>
                      {selectedCategory ? selectedCategory.label : 'Select a category'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
                </TouchableOpacity>
              </Animated.View>

              {/* Amount Field */}
              <Text style={[styles.fieldLabel, { marginTop: Spacing.xl }]}>
                Amount <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={text => setAmount(text.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={Colors.text.tertiary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>

              {/* Note Field */}
              <Text style={[styles.fieldLabel, { marginTop: Spacing.xl }]}>
                Note <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a short note about this expense..."
                placeholderTextColor={Colors.text.tertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Summary Row */}
              {selectedCategory && amount && parseFloat(amount) > 0 && (
                <View style={styles.summaryRow}>
                  <Ionicons name="information-circle-outline" size={16} color={Colors.primary.main} />
                  <Text style={styles.summaryText}>
                    Posting <Text style={styles.summaryBold}>{parseFloat(amount).toFixed(3)}</Text> under{' '}
                    <Text style={styles.summaryBold}>{selectedCategory.label}</Text>
                  </Text>
                </View>
              )}

              {/* Post Button */}
              <TouchableOpacity
                onPress={handlePost}
                disabled={loading}
                activeOpacity={0.85}
                style={styles.postButton}
              >
                <LinearGradient
                  colors={loading ? ['#A78BFA', '#C4B5FD'] : ['#6366F1', '#8B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.postButtonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane-outline" size={20} color="#fff" style={{ marginRight: 10 }} />
                      <Text style={styles.postButtonText}>Post Expense</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Category Modal */}
        <Modal
          visible={showCategoryModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCategoryModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCategoryModal(false)}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Category</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Loading state */}
                {categoriesLoading && (
                  <View style={styles.catStateWrap}>
                    <ActivityIndicator size="large" color={Colors.primary.main} />
                    <Text style={styles.catStateText}>Loading categories...</Text>
                  </View>
                )}

                {/* Error state */}
                {!categoriesLoading && categoriesError && (
                  <TouchableOpacity style={styles.catStateWrap} onPress={fetchCategories} activeOpacity={0.8}>
                    <Ionicons name="cloud-offline-outline" size={36} color={Colors.error.main} />
                    <Text style={[styles.catStateText, { color: Colors.error.main }]}>{categoriesError}</Text>
                    <Text style={[styles.catStateText, { color: Colors.primary.main, fontWeight: '700' }]}>Tap to retry</Text>
                  </TouchableOpacity>
                )}

                {/* Category list */}
                {!categoriesLoading && !categoriesError && categories.map((cat, idx) => {
                  const isActive = selectedCategory?.label === cat.label;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.categoryItem, isActive && styles.categoryItemActive]}
                      onPress={() => {
                        setSelectedCategory(cat);
                        setShowCategoryModal(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.categoryItemIcon, { backgroundColor: cat.color + '20' }]}>
                        <Ionicons name={cat.icon} size={22} color={cat.color} />
                      </View>
                      <Text style={[styles.categoryItemText, isActive && { color: cat.color, fontWeight: '700' }]}>
                        {cat.label}
                      </Text>
                      {isActive && (
                        <Ionicons name="checkmark-circle" size={22} color={cat.color} />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* Empty state */}
                {!categoriesLoading && !categoriesError && categories.length === 0 && (
                  <View style={styles.catStateWrap}>
                    <Ionicons name="folder-open-outline" size={36} color={Colors.text.tertiary} />
                    <Text style={styles.catStateText}>No categories found.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: 0.3,
  },

  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },

  heroBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  heroBannerIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  heroBannerTitle: {
    fontSize: Typography.sizes['2xl'],
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  heroBannerSubtitle: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    textAlign: 'center',
  },

  formCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    backgroundColor: '#fff',
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },

  fieldLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: Colors.error.main,
    fontWeight: '700',
  },
  optional: {
    color: Colors.text.tertiary,
    fontWeight: '400',
    textTransform: 'none',
    fontSize: Typography.sizes.xs,
  },

  // Dropdown
  dropdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.neutral[50],
    minHeight: 56,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.md,
  },
  categoryIconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  dropdownPlaceholder: {
    fontWeight: '400',
    color: Colors.text.tertiary,
  },

  // Amount
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.neutral[50],
    overflow: 'hidden',
    minHeight: 56,
  },
  amountInput: {
    flex: 1,
    fontSize: Typography.sizes['2xl'],
    fontWeight: '700',
    color: Colors.text.primary,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },

  // Note
  noteInput: {
    borderWidth: 1.5,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    minHeight: 90,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  summaryText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  summaryBold: {
    fontWeight: '700',
    color: Colors.primary.main,
  },

  // Post Button
  postButton: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  postButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.base + 2,
    borderRadius: BorderRadius.lg,
  },
  postButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: BorderRadius['3xl'],
    borderTopRightRadius: BorderRadius['3xl'],
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['4xl'],
    maxHeight: '70%',
  },
  modalHandle: {
    width: 44,
    height: 4,
    backgroundColor: Colors.neutral[200],
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  categoryItemActive: {
    backgroundColor: Colors.primary[50],
  },
  categoryItemIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryItemText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '500',
    color: Colors.text.secondary,
  },

  // Category modal states
  catStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  catStateText: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
});
