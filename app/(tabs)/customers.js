// app/(tabs)/customers.js
import { Ionicons } from "@expo/vector-icons";
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import dbService from "../../src/services/database";

export default function DebtorsScreen() {
  const [data, setData] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [areas, setAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState("All");
  const [totalStores, setTotalStores] = useState(0);
  const [totalBalance, setTotalBalance] = useState(0);
  const [showAreaPicker, setShowAreaPicker] = useState(false); // iOS Area Picker
  const router = useRouter();

  // back handler
  useEffect(() => {
    const backAction = () => {
      router.replace("/Company");
      return true;
    };

    const bh = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => bh.remove();
  }, []);

  // load from sqlite
  const loadLocalCustomers = async () => {
    try {
      setLoading(true);
      await dbService.init();
      const rows = await dbService.getCustomers();
      const areaList = await dbService.getAreas();
      setAreas(["All", ...areaList]);

      if (rows.length === 0) {
        setLoading(false);
        Alert.alert(
          "No Customer Data",
          "No customer data found. Please download data from Home screen first.",
          [
            { text: "Go to Home", onPress: () => router.replace("/(tabs)/Home") },
            { text: "Cancel", style: "cancel" }
          ]
        );
        return;
      }

      // Filter out customers with zero balance and sort alphabetically
      const filteredRows = rows
        .filter((item) => Number(item.balance ?? 0) !== 0)
        .sort((a, b) => {
          const nameA = (a.name ?? "").toLowerCase();
          const nameB = (b.name ?? "").toLowerCase();
          return nameA.localeCompare(nameB);
        });

      setData(filteredRows);
      setFiltered(filteredRows);

      // Calculate totals
      const totalBal = rows.reduce((sum, item) => sum + (item.balance || 0), 0);
      setTotalStores(filteredRows.length);
      setTotalBalance(Math.round(totalBal));

    } catch (err) {
      console.error("[Customers] Error loading customers:", err);
      Alert.alert("Error", "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocalCustomers();
  }, []);

  // reset search on focus
  useFocusEffect(
    useCallback(() => {
      setSearchQuery("");
      setFiltered(data);
    }, [data])
  );

  // search filter with alphabetical sorting
  // search and area filter
  useEffect(() => {
    const q = searchQuery.toLowerCase();
    const f = data
      .filter((i) => {
        const matchesSearch =
          (i.name ?? "").toLowerCase().includes(q) ||
          (i.place ?? "").toLowerCase().includes(q) ||
          (i.phone ?? "").toLowerCase().includes(q);

        const matchesArea = selectedArea === "All" || (i.area ?? "") === selectedArea;

        return matchesSearch && matchesArea;
      })
      .sort((a, b) => {
        const nameA = (a.name ?? "").toLowerCase();
        const nameB = (b.name ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    setFiltered(f);
  }, [searchQuery, selectedArea, data]);

  if (loading) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
        <Text style={styles.loadingText}>Loading customers...</Text>
      </LinearGradient>
    );
  }

  const renderCard = ({ item, index }) => {
    const balance = item.balance ?? 0;

    return (
      <Animated.View entering={FadeInUp.delay(index * 40)}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() =>
            router.push({
              pathname: "/customer-ledger",
              params: {
                code: item.code ?? item.id,
                name: item.name,
                current_balance: balance.toString(),
              },
            })
          }
        >
          <View style={styles.cardRow}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.metaContainer}>
                {item.phone ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="call-outline" size={14} color={Colors.text.tertiary} />
                    <Text style={styles.subText}>{item.phone}</Text>
                  </View>
                ) : null}
                {item.place ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={14} color={Colors.text.tertiary} />
                    <Text style={styles.subText}>{item.place}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text
                style={[
                  styles.balanceText,
                  { color: balance < 0 ? Colors.error.main : Colors.success.main },
                ]}
              >
                {Math.round(balance).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={Colors.neutral[400]}
            style={styles.cardArrow}
          />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.title}>Customers Statement</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Summary Cards */}
        <Animated.View entering={FadeInUp.delay(80)} style={styles.summaryContainer}>
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <View style={styles.summaryIconCircle}>
              <Ionicons name="people" size={20} color={Colors.primary.main} />
            </View>
            <View>
              <Text style={styles.summaryLabel}>Total Stores</Text>
              <Text style={styles.summaryValue}>{totalStores}</Text>
            </View>
          </LinearGradient>

          <LinearGradient
            colors={Gradients.success}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <View style={[styles.summaryIconCircle, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
              <Ionicons name="wallet" size={20} color={Colors.success.main} />
            </View>
            <View>
              <Text style={styles.summaryLabel}>Total Balance</Text>
              <Text style={styles.summaryValue}>{(totalBalance / 1000).toFixed(1)}k</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Area Filter */}
        <View style={styles.areaFilterContainer}>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity 
              style={styles.searchablePickerTrigger}
              onPress={() => setShowAreaPicker(true)}
            >
              <View style={styles.areaPickerContent}>
                <Ionicons name="location" size={18} color={Colors.primary.main} />
                <Text style={styles.searchablePickerText}>{selectedArea || "All Areas"}</Text>
              </View>
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
                    style={{ fontSize: 14, color: Colors.text.primary }}
                  />
                ))}
              </Picker>
            </View>
          )}
        </View>

        {/* Search */}
        <Animated.View entering={FadeInUp.delay(120)} style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.text.tertiary} style={styles.searchIcon} />
          <TextInput
            placeholder="Search Name, Place, Phone..."
            placeholderTextColor={Colors.text.tertiary}
            style={styles.searchBox}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </Animated.View>

        {/* List Header */}
        <Animated.View entering={FadeInUp.delay(150)} style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>Customer List</Text>
          <Text style={styles.listHeaderCount}>{filtered.length} found</Text>
        </Animated.View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => (item.code ?? item.id ?? Math.random().toString()).toString()}
          renderItem={renderCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={Colors.primary[200]} />
              <Text style={styles.emptyText}>
                No customers found.
              </Text>
            </View>
          }
        />
      </SafeAreaView>

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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    marginTop: 35,
    paddingBottom: Spacing.md,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.text.secondary,
    fontSize: Typography.sizes.base
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.md,
  },
  summaryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: Typography.sizes.lg,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  searchContainer: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    height: 50,
    ...Shadows.sm,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  listHeaderTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  listHeaderCount: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  cardRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginRight: Spacing.sm,
  },
  cardInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  cardName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  metaContainer: {
    gap: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.secondary,
  },
  balanceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  balanceText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
  },
  cardArrow: {
    opacity: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing['3xl'],
  },
  emptyText: {
    marginTop: Spacing.md,
    color: Colors.text.tertiary,
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
  areaFilterContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  pickerWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
    overflow: 'hidden', // iOS fix
  },
  picker: {
    // height: 50, // Android sometimes needs explicit height, but usually auto works
    color: Colors.text.primary,
  },
  // iOS Picker Styles
  searchablePickerTrigger: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadows.sm,
  },
  areaPickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchablePickerText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  pickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    width: '100%',
    maxWidth: 400,
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
});