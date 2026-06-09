// app/Expense/ExpenseReport.js
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from '../../constants/theme';

// Gradient theme for expense screen
const EXP_GRADIENT = ['#6366F1', '#8B5CF6'];
const EXP_COLOR    = '#6366F1';

// ── Utility helpers ──────────────────────────────────────────────────────────
const toDateStr = (d) => d.toISOString().split('T')[0]; // YYYY-MM-DD

const fmtDate = (d) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

const fmtTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const fmtCurrency = (val) =>
  `₹${parseFloat(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── Component ────────────────────────────────────────────────────────────────
export default function ExpenseReport() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Date state — default today
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  // Data state
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchExpenses = useCallback(async (date = selectedDate, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const token    = await AsyncStorage.getItem('authToken');
      const uname    = await AsyncStorage.getItem('username');
      setUsername(uname || '');

      const resp = await fetch('https://tasksas.com/api/expense-tracker/', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json    = await resp.json();
      const rawList = Array.isArray(json) ? json : (json.results || json.data || []);
      const dateStr = toDateStr(date);
      const lowerU  = (uname || '').toLowerCase().trim();

      // Filter: same user + same selected date
      const filtered = rawList.filter((item) => {
        const itemDate = (item.created_at || '').split('T')[0];
        const itemUser = (item.username   || '').toLowerCase().trim();
        return itemDate === dateStr && itemUser === lowerU;
      });

      // Sort newest first
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRecords(filtered);
    } catch (e) {
      console.error('[ExpenseReport] fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      fetchExpenses(selectedDate);
    }, []) // only on screen focus
  );

  // ── Date picker handler ───────────────────────────────────────────────────
  const onDateChange = (event, date) => {
    setShowPicker(Platform.OS === 'ios'); // keep open on iOS
    if (date) {
      setSelectedDate(date);
      fetchExpenses(date);
    }
  };

  // ── Overview computations ─────────────────────────────────────────────────
  const totalAmount = records.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const totalCount  = records.length;

  const isToday = toDateStr(selectedDate) === toDateStr(new Date());

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={EXP_GRADIENT}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Expense Records</Text>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => fetchExpenses(selectedDate, true)}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* User badge */}
        <View style={styles.userBadge}>
          <Ionicons name="person-circle-outline" size={16} color="rgba(255,255,255,0.85)" />
          <Text style={styles.userBadgeText}>{username || 'Loading...'}</Text>
        </View>

        {/* Date picker row */}
        <TouchableOpacity
          style={styles.dateSelectorBtn}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={styles.dateSelectorText}>
            {isToday ? `Today — ${fmtDate(selectedDate)}` : fmtDate(selectedDate)}
          </Text>
          <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Native Date Picker ── */}
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchExpenses(selectedDate, true)}
            tintColor={EXP_COLOR}
            colors={[EXP_COLOR]}
          />
        }
      >
        {/* ── Overview Card ── */}
        <View style={styles.overviewCard}>
          <LinearGradient
            colors={['#EDE9FE', '#F5F3FF']}
            style={styles.overviewGradient}
          >
            <Text style={styles.overviewLabel}>
              {isToday ? "Today's Overview" : `Overview for ${fmtDate(selectedDate)}`}
            </Text>

            <View style={styles.overviewStats}>
              {/* Total Amount */}
              <View style={styles.overviewStat}>
                <LinearGradient colors={EXP_GRADIENT} style={styles.overviewStatIcon}>
                  <Ionicons name="wallet" size={20} color="#fff" />
                </LinearGradient>
                <Text style={styles.overviewStatValue}>{fmtCurrency(totalAmount)}</Text>
                <Text style={styles.overviewStatLabel}>Total Spent</Text>
              </View>

              {/* Divider */}
              <View style={styles.overviewDivider} />

              {/* Total Records */}
              <View style={styles.overviewStat}>
                <LinearGradient colors={['#10B981', '#34D399']} style={styles.overviewStatIcon}>
                  <Ionicons name="receipt" size={20} color="#fff" />
                </LinearGradient>
                <Text style={styles.overviewStatValue}>{totalCount}</Text>
                <Text style={styles.overviewStatLabel}>
                  {totalCount === 1 ? 'Expense' : 'Expenses'}
                </Text>
              </View>

              {/* Divider */}
              <View style={styles.overviewDivider} />

              {/* Average */}
              <View style={styles.overviewStat}>
                <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.overviewStatIcon}>
                  <Ionicons name="stats-chart" size={20} color="#fff" />
                </LinearGradient>
                <Text style={styles.overviewStatValue}>
                  {totalCount > 0 ? fmtCurrency(totalAmount / totalCount) : '₹0.00'}
                </Text>
                <Text style={styles.overviewStatLabel}>Average</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Section label ── */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>Expense Entries</Text>
          {!loading && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalCount}</Text>
            </View>
          )}
          {loading && <ActivityIndicator size="small" color={EXP_COLOR} />}
        </View>

        {/* ── Loading Skeleton ── */}
        {loading && (
          <View style={styles.skeletonWrap}>
            {[1, 2, 3].map((k) => (
              <View key={k} style={styles.skeletonCard}>
                <View style={styles.skeletonAccent} />
                <View style={styles.skeletonBody}>
                  <View style={[styles.skeletonLine, { width: '60%' }]} />
                  <View style={[styles.skeletonLine, { width: '40%', marginTop: 6 }]} />
                  <View style={[styles.skeletonLine, { width: '80%', marginTop: 6 }]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Empty State ── */}
        {!loading && records.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="receipt-outline" size={44} color="#C4B5FD" />
            </View>
            <Text style={styles.emptyTitle}>No Expenses Found</Text>
            <Text style={styles.emptySub}>
              No expense records for{' '}
              {isToday ? 'today' : fmtDate(selectedDate)}.{'\n'}
              Try selecting a different date.
            </Text>
            <TouchableOpacity
              style={styles.emptyDateBtn}
              onPress={() => setShowPicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={16} color={EXP_COLOR} />
              <Text style={styles.emptyDateBtnText}>Change Date</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Record List ── */}
        {!loading && records.length > 0 && (
          <View style={styles.list}>
            {records.map((item, idx) => {
              const amtNum = parseFloat(item.amount || 0);
              return (
                <View key={item.id ?? idx} style={styles.cardWrapper}>
                  <View style={styles.card}>
                    {/* Left purple accent */}
                    <View style={styles.cardAccent} />

                    <View style={styles.cardBody}>
                      {/* Row 1: category name + amount */}
                      <View style={styles.cardTopRow}>
                        <View style={styles.categoryChip}>
                          <View style={styles.categoryIconBox}>
                            <Ionicons name="receipt-outline" size={15} color={EXP_COLOR} />
                          </View>
                          <Text style={styles.categoryName} numberOfLines={1}>
                            {item.expense_name || '—'}
                          </Text>
                        </View>
                        <Text style={styles.amountText}>{fmtCurrency(amtNum)}</Text>
                      </View>

                      {/* Row 2: remark */}
                      {!!item.remark && (
                        <Text style={styles.remarkText} numberOfLines={2}>
                          {item.remark}
                        </Text>
                      )}

                      {/* Row 3: meta — ID · username · time */}
                      <View style={styles.metaRow}>
                        <Ionicons name="pricetag-outline" size={11} color={Colors.text.tertiary} />
                        <Text style={styles.metaText}>#{item.id}</Text>
                        <View style={styles.metaDot} />
                        <Ionicons name="person-outline" size={11} color={Colors.text.tertiary} />
                        <Text style={styles.metaText}>{item.username}</Text>
                        <View style={styles.metaDot} />
                        <Ionicons name="time-outline" size={11} color={Colors.text.tertiary} />
                        <Text style={styles.metaText}>{fmtTime(item.created_at)}</Text>
                      </View>

                      {/* Row 4: date chip + client id */}
                      <View style={styles.chipsRow}>
                        <View style={styles.dateChip}>
                          <Ionicons name="calendar-outline" size={10} color={EXP_COLOR} />
                          <Text style={styles.dateChipText}>
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString('en-IN', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                })
                              : '—'}
                          </Text>
                        </View>
                        {!!item.client_id && (
                          <View style={styles.clientChip}>
                            <Text style={styles.clientChipText}>Client #{item.client_id}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
  },

  // User badge
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    marginBottom: Spacing.md,
  },
  userBadgeText: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Date selector
  dateSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  dateSelectorText: {
    fontSize: Typography.sizes.sm,
    color: '#fff',
    fontWeight: '700',
  },

  // Scroll
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },

  // Overview
  overviewCard: {
    borderRadius: BorderRadius['2xl'],
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    ...Shadows.md,
    backgroundColor: 'transparent',
  },
  overviewGradient: {
    padding: Spacing.xl,
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  overviewLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#5B21B6',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  overviewStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  overviewStat: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  overviewStatIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    elevation: 4,
    shadowColor: EXP_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  overviewStatValue: {
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  overviewStatLabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '600',
    textAlign: 'center',
  },
  overviewDivider: {
    width: 1,
    height: 60,
    backgroundColor: '#DDD6FE',
  },

  // List header
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: 4,
    gap: 8,
  },
  listHeaderTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.3,
  },
  countBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 2,
    minWidth: 26,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: EXP_COLOR,
  },

  // Skeleton
  skeletonWrap: { gap: Spacing.md, marginBottom: Spacing.xl },
  skeletonCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    height: 90,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Shadows.sm,
  },
  skeletonAccent: {
    width: 4,
    backgroundColor: '#DDD6FE',
  },
  skeletonBody: {
    flex: 1,
    padding: Spacing.base,
    justifyContent: 'center',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.md,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  emptySub: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    backgroundColor: '#EDE9FE',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
  },
  emptyDateBtnText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: EXP_COLOR,
  },

  // Record list
  list: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  cardWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.sm,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardAccent: {
    width: 4,
    backgroundColor: EXP_COLOR,
  },
  cardBody: {
    flex: 1,
    padding: Spacing.md,
    paddingLeft: Spacing.base,
    gap: 5,
  },

  // Card rows
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    marginRight: 8,
  },
  categoryIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
  },
  amountText: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: EXP_COLOR,
    letterSpacing: 0.3,
  },

  remarkText: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.neutral[300],
  },

  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  dateChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: EXP_COLOR,
  },
  clientChip: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  clientChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
});
