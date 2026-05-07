import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { BorderRadius, Colors, Spacing, Typography } from '../../constants/theme';
import dbService from '../../src/services/database';
import savedOrdersDbService from '../../src/services/savedOrdersDb';

const getDateStrings = () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  return { today, yesterday: yest.toISOString().split('T')[0] };
};

const buildStats = (items) => {
  let totalAmount = 0;
  let customerMap = {};
  items.forEach(item => {
    const amt = parseFloat(item.amount || 0);
    totalAmount += amt;
    const name = item.customer_name || 'Unknown';
    if (!customerMap[name]) customerMap[name] = { count: 0, amount: 0, transactions: [] };
    customerMap[name].count += 1;
    customerMap[name].amount += amt;
    customerMap[name].transactions.push({
      amount: amt,
      type: item.payment_type || 'Cash',
      date: item.date || item.synced_at,
      status: item.synced ? 'Uploaded' : 'Pending',
    });
  });
  return { count: items.length, amount: totalAmount, customers: customerMap };
};

export default function CollectionReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [allData, setAllData] = useState({ today: [], yesterday: [] });
  const [selectedDay, setSelectedDay] = useState('today');
  const { today, yesterday } = getDateStrings();

  const fetchReport = async () => {
    try {
      setLoading(true);
      await dbService.init();

      // Pending (local DB)
      const pending = await dbService.getOfflineCollections(false);
      const pendingFiltered = pending.filter(item => {
        const d = item.date?.split('T')[0];
        return d === today || d === yesterday;
      });

      // Saved/Uploaded (SQLite)
      const saved = await savedOrdersDbService.getSavedTransactions('Collection');
      const savedFiltered = saved.filter(item => {
        const d = (item.synced_at || item.date)?.split('T')[0];
        return d === today || d === yesterday;
      });

      const all = [...pendingFiltered, ...savedFiltered];
      setAllData({
        today: all.filter(i => (i.date || i.synced_at)?.split('T')[0] === today),
        yesterday: all.filter(i => (i.date || i.synced_at)?.split('T')[0] === yesterday),
      });
    } catch (error) {
      console.error('[CollectionReport] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchReport(); }, []));

  const data = useMemo(() => buildStats(allData[selectedDay] || []), [allData, selectedDay]);
  const todayCount = allData.today.length;
  const yesterdayCount = allData.yesterday.length;

  const selectedDateLabel = selectedDay === 'today'
    ? new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : new Date(yesterday).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Collection Report</Text>
        <TouchableOpacity onPress={fetchReport} style={styles.backButton}>
          {loading
            ? <ActivityIndicator size="small" color={Colors.warning.main} />
            : <Ionicons name="refresh" size={24} color={Colors.warning.main} />}
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {['today', 'yesterday'].map(day => (
          <TouchableOpacity
            key={day}
            style={[styles.tab, selectedDay === day && styles.tabActive]}
            onPress={() => setSelectedDay(day)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, selectedDay === day && styles.tabTextActive]}>
              {day === 'today' ? 'Today' : 'Yesterday'}
            </Text>
            {(day === 'today' ? todayCount : yesterdayCount) > 0 && (
              <View style={[styles.tabBadge, selectedDay === day && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, selectedDay === day && styles.tabBadgeTextActive]}>
                  {day === 'today' ? todayCount : yesterdayCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchReport} colors={[Colors.warning.main]} />}
      >
        <LinearGradient colors={[Colors.warning.main, Colors.warning[700] || '#b45309']} style={styles.summaryCard}>
          <Text style={styles.bannerDate}>{selectedDateLabel}</Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Collections</Text>
              <Text style={styles.statValue}>{data.count}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Amount</Text>
              <Text style={styles.statValue}>₹{data.amount.toLocaleString()}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Breakdown</Text>
          {Object.keys(data.customers).length > 0 ? (
            Object.entries(data.customers).map(([name, stats], index) => (
              <View key={index} style={styles.customerItem}>
                <View style={styles.customerInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.customerAmount}>₹{stats.amount.toLocaleString()}</Text>
                  </View>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats.count} Payments</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={48} color={Colors.neutral?.[300] || '#CBD5E1'} />
              <Text style={styles.emptyText}>No collections for {selectedDay === 'today' ? 'today' : 'yesterday'}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const ACCENT = Colors.warning.main;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.neutral?.[200] || '#E2E8F0' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: Typography.sizes.lg, fontWeight: '800', color: Colors.text.primary },
  tabRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.neutral?.[200] || '#E2E8F0', gap: Spacing.sm },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: BorderRadius.lg, backgroundColor: '#F1F5F9', gap: 6 },
  tabActive: { backgroundColor: ACCENT },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.text?.secondary || '#64748b' },
  tabTextActive: { color: '#FFFFFF' },
  tabBadge: { backgroundColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 22, alignItems: 'center' },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  tabBadgeTextActive: { color: '#FFFFFF' },
  scrollContent: { padding: Spacing.lg },
  summaryCard: { borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.xl, elevation: 8, shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  bannerDate: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: Spacing.md },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4, fontWeight: '600' },
  statValue: { fontSize: 24, color: '#FFFFFF', fontWeight: '800' },
  divider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },
  section: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, padding: Spacing.lg, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.secondary, marginBottom: Spacing.lg, textTransform: 'uppercase', letterSpacing: 0.5 },
  customerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.neutral?.[100] || '#F1F5F9' },
  customerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.warning?.[50] || '#fffbeb', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: ACCENT, fontWeight: '700', fontSize: 14 },
  customerName: { fontSize: 15, fontWeight: '600', color: Colors.text.primary },
  customerAmount: { fontSize: 13, color: Colors.text.tertiary, fontWeight: '500', marginTop: 2 },
  badge: { backgroundColor: Colors.warning?.[50] || '#fffbeb', paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { color: ACCENT, fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.md },
  emptyText: { color: Colors.text.tertiary, fontSize: 16, fontWeight: '500' },
});
