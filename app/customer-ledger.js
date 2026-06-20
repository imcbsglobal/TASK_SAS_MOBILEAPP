import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../constants/theme";

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;


const API_URL = "https://tasksas.com/api/get-ledger-details?account_code=";

export default function CustomerLedgerScreen() {
  const { code, name, current_balance } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState([]);
  const [filteredLedger, setFilteredLedger] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(Number(current_balance) || 0);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);

  // Date range states
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState(null); // "from" or "to"

  useEffect(() => {
    fetchLedger();
  }, [code]);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        router.replace("/");
        return;
      }

      const res = await fetch(`${API_URL}${code}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        console.error("Invalid JSON:", text.slice(0, 200));
        Alert.alert("Server Error", "Invalid response from server.");
        setLoading(false);
        return;
      }

      let entries = Array.isArray(result) ? result : result.data || [];

      entries.sort((a, b) => {
        const dateA = new Date(a.entry_date);
        const dateB = new Date(b.entry_date);
        if (dateA.getTime() === dateB.getTime()) {
          return (a.voucher_no || 0) - (b.voucher_no || 0);
        }
        return dateB - dateA;
      });

      setLedger(entries);
      setFilteredLedger(entries);
      calculateReverseBalances(entries, Number(current_balance) || 0, false);
    } catch (err) {
      console.error("Ledger Fetch Error:", err);
      Alert.alert("Network Error", "Unable to fetch ledger details.");
    } finally {
      setLoading(false);
    }
  };

  const calculateReverseBalances = (entries, currentClosing, isDateFiltered) => {
    if (!entries.length) return;

    const grouped = {};
    entries.forEach((e) => {
      const d = e.entry_date;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(e);
    });

    const dates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
    let balances = {};
    let nextOpening = currentClosing;

    for (let i = dates.length - 1; i >= 0; i--) {
      const date = dates[i];
      const dayEntries = grouped[date];
      let debitTotal = 0;
      let creditTotal = 0;

      dayEntries.forEach((e) => {
        debitTotal += Number(e.debit || 0);
        creditTotal += Number(e.credit || 0);
      });

      const closing = nextOpening;
      const opening = closing - debitTotal + creditTotal;
      balances[date] = { opening, closing, debitTotal, creditTotal };
      nextOpening = opening;
    }

    if (!isDateFiltered) {
      let totalDebitAll = 0;
      let totalCreditAll = 0;
      entries.forEach((e) => {
        totalDebitAll += Number(e.debit || 0);
        totalCreditAll += Number(e.credit || 0);
      });

      const earliestDate = dates[0];
      const earliest = balances[earliestDate];

      setOpeningBalance(earliest?.opening || 0);
      setClosingBalance(currentClosing);
      setTotalDebit(totalDebitAll);
      setTotalCredit(totalCreditAll);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const filterByDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) return;
    const from = new Date(startDate);
    const to = new Date(endDate);

    const filtered = ledger.filter((e) => {
      const d = new Date(e.entry_date);
      return d >= from && d <= to;
    });

    setFilteredLedger(filtered);
    calculateReverseBalances(filtered, Number(current_balance) || 0, true);

    let totalDebit = 0;
    let totalCredit = 0;
    filtered.forEach((e) => {
      totalDebit += Number(e.debit || 0);
      totalCredit += Number(e.credit || 0);
    });

    setTotalDebit(totalDebit);
    setTotalCredit(totalCredit);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS !== "ios") setShowDatePicker(false);
    if (selectedDate) {
      if (datePickerMode === "from") {
        setFromDate(selectedDate);
        if (toDate) filterByDateRange(selectedDate, toDate);
      } else if (datePickerMode === "to") {
        setToDate(selectedDate);
        if (fromDate) filterByDateRange(fromDate, selectedDate);
      }
    }
  };

  const refreshAll = () => {
    setFromDate(null);
    setToDate(null);
    setFilteredLedger(ledger);
    calculateReverseBalances(ledger, Number(current_balance) || 0, false);
  };

  const renderItem = ({ item }) => {
    const isCredit = item.credit && item.credit > 0;
    const amount = isCredit ? item.credit : item.debit;
    const color = isCredit ? Colors.error.main : Colors.success.main;

    return (
      <Animated.View entering={FadeInUp.delay(20)}>
        <View style={styles.transactionCard}>
          <View style={styles.rowBetween}>
            <View style={[styles.rowCenter, { flex: 1 }]}>
              <View style={[styles.iconCircle, { backgroundColor: isCredit ? Colors.error[50] : Colors.success[50] }]}>
                <Ionicons name={isCredit ? "arrow-down" : "arrow-up"} size={18} color={color} />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.particulars} numberOfLines={1} ellipsizeMode="tail">
                  {item.particulars}
                </Text>
                <Text style={styles.subText}>
                  {formatDate(item.entry_date)} {item.narration ? `• ${item.narration}` : ""}
                </Text>
                <Text style={styles.voucherText}>Voucher ID: {item.voucher_no || "-"}</Text>
              </View>
            </View>
            <View style={{ marginLeft: 10, minWidth: 90, alignItems: "flex-end" }}>
              <Text style={[styles.amountText, { color }]}>
                {Math.abs(amount || 0).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />

        {/* Header Card with iOS shadow fix */}
        <View style={styles.headerContainer}>
          <View style={styles.headerShadowWrapper}>
            <LinearGradient colors={Gradients.primary} style={styles.headerCard}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Animated.Text entering={FadeInUp} style={styles.title} numberOfLines={1}>
                  {name || "Customer Ledger"}
                </Animated.Text>
                <Animated.Text entering={FadeInUp.delay(40)} style={styles.dateText}>
                  {fromDate && toDate
                    ? `${formatDate(fromDate)} → ${formatDate(toDate)}`
                    : "All Transactions"}
                  <Text> • Build: 20-06-2026</Text>
                </Animated.Text>
              </View>
              <TouchableOpacity onPress={refreshAll} style={styles.iconAction}>
                <Ionicons name="refresh" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.dateActions}>
              <TouchableOpacity
                onPress={() => {
                  setDatePickerMode("from");
                  setShowDatePicker(true);
                }}
                style={styles.dateButton}
              >
                <Ionicons name="calendar-outline" size={16} color="#FFF" />
                <Text style={styles.dateButtonText}>From Date</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setDatePickerMode("to");
                  setShowDatePicker(true);
                }}
                style={styles.dateButton}
              >
                <Ionicons name="calendar" size={16} color="#FFF" />
                <Text style={styles.dateButtonText}>To Date</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>

        {showDatePicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent={true} animationType="slide">
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <View style={{ backgroundColor: '#fff', paddingBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 15, borderBottomWidth: 1, borderColor: Colors.border.light }}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={{ color: Colors.primary.main, fontWeight: '700', fontSize: 16 }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={datePickerMode === "from" ? (fromDate || new Date()) : (toDate || new Date())}
                    mode="date"
                    display="spinner"
                    onChange={onDateChange}
                    themeVariant="light"
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={datePickerMode === "from" ? (fromDate || new Date()) : (toDate || new Date())}
              mode="date"
              display="calendar"
              onChange={onDateChange}
            />
          )
        )}

        <View style={styles.contentContainer}>
          {/* Balances */}
          <View style={styles.balanceRow}>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={styles.balanceValue}>
                {closingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>Opening Balance</Text>
              <Text style={styles.balanceValue}>
                {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          <View style={styles.totalCard}>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>Total Credit</Text>
              <Text style={[styles.totalValue, { color: Colors.error.main }]}>{totalCredit.toLocaleString("en-IN")}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>Total Debit</Text>
              <Text style={[styles.totalValue, { color: Colors.success.main }]}>{totalDebit.toLocaleString("en-IN")}</Text>
            </View>
          </View>

          <Text style={styles.transHeading}>TRANSACTIONS</Text>

          <FlatList
            data={filteredLedger}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="documents-outline" size={48} color={Colors.neutral[300]} />
                <Text style={styles.emptyText}>No transactions found.</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Footer — in normal flow, safely above nav bar */}
        <View style={[styles.footerCard, { marginBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <LinearGradient
            colors={Gradients.surface}
            style={styles.footerGradient}
          >
            <Text style={styles.footerLabel}>Closing Balance</Text>
            <Text style={styles.footerValue}>
              {closingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </Text>
          </LinearGradient>
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },

  safeArea: {
    flex: 1,
    paddingTop: STATUSBAR_HEIGHT,
  },

  headerContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  headerShadowWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.md,
  },
  headerCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    overflow: 'hidden',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: { paddingRight: Spacing.md },
  title: { fontSize: Typography.sizes.lg, fontWeight: "700", color: "#FFF" },
  dateText: { fontSize: Typography.sizes.sm, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  iconAction: { padding: 4 },

  dateActions: { flexDirection: 'row', gap: Spacing.md },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  dateButtonText: { color: '#FFF', fontSize: Typography.sizes.sm, fontWeight: '600' },

  contentContainer: { flex: 1, paddingHorizontal: Spacing.lg },

  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: Spacing.md, gap: Spacing.md },
  balanceBox: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  balanceLabel: { color: Colors.text.secondary, fontWeight: "600", fontSize: Typography.sizes.xs },
  balanceValue: { fontSize: Typography.sizes.base, fontWeight: "700", color: Colors.text.primary, marginTop: 4 },

  totalCard: {
    flexDirection: "row",
    backgroundColor: '#FFF',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  totalItem: { flex: 1, alignItems: "center" },
  divider: { width: 1, height: 36, backgroundColor: Colors.border.medium },
  totalLabel: { color: Colors.text.secondary, fontWeight: "600", fontSize: Typography.sizes.xs },
  totalValue: { fontSize: Typography.sizes.base, fontWeight: "700" },

  transHeading: { fontSize: Typography.sizes.sm, fontWeight: "700", color: Colors.text.tertiary, marginBottom: Spacing.sm },

  listContent: { paddingBottom: 100 },

  transactionCard: {
    backgroundColor: "#FFF",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: Spacing['2xl'] },
  emptyText: { textAlign: "center", color: Colors.text.tertiary, marginTop: Spacing.md },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowCenter: { flexDirection: "row", alignItems: "center" },

  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },

  particulars: { fontWeight: "700", color: Colors.text.primary, maxWidth: 220, fontSize: Typography.sizes.sm },
  subText: { color: Colors.text.secondary, fontSize: Typography.sizes.xs, marginTop: 2 },
  voucherText: { color: Colors.text.tertiary, fontSize: 10, marginTop: 2 },

  amountText: { fontSize: Typography.sizes.base, fontWeight: "700", textAlign: "right" },

  footerCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  footerGradient: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  footerLabel: { color: Colors.text.secondary, fontSize: Typography.sizes.sm, fontWeight: "700" },
  footerValue: { color: Colors.primary.main, fontSize: Typography.sizes.xl, fontWeight: "900", marginTop: 4 },
});