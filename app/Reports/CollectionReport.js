import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Spacing, Typography } from '../../constants/theme';
import dbService from '../../src/services/database';
import savedOrdersDbService from '../../src/services/savedOrdersDb';

export default function CollectionReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ count: 0, amount: 0, customers: {} });

  const fetchReport = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      await dbService.init();
      
      // Fetch Pending
      const pending = await dbService.getOfflineCollections(false);
      const todaysPending = pending.filter(item => {
        const itemDate = item.date?.split('T')[0];
        return itemDate === today;
      });

      // Fetch Saved (Uploaded)
      const saved = await savedOrdersDbService.getSavedTransactions('Collection');
      const todaysSaved = saved.filter(item => {
        const itemDate = (item.synced_at || item.date)?.split('T')[0];
        return itemDate === today;
      });

      const all = [...todaysPending, ...todaysSaved];
      let totalAmount = 0;
      let customerMap = {};

      all.forEach(item => {
        const itemAmount = parseFloat(item.amount || 0);
        totalAmount += itemAmount;
        const custName = item.customer_name || 'Unknown';
        
        if (!customerMap[custName]) {
          customerMap[custName] = { count: 0, amount: 0, transactions: [] };
        }
        customerMap[custName].count += 1;
        customerMap[custName].amount += itemAmount;
        customerMap[custName].transactions.push({
          amount: itemAmount,
          type: item.payment_type || 'Cash',
          date: item.date || item.synced_at,
          status: item.synced ? 'Uploaded' : 'Pending'
        });
      });

      setData({ count: all.length, amount: totalAmount, customers: customerMap });
    } catch (error) {
      console.error('[CollectionReport] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchReport(); }, []));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Collection Report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchReport} colors={[Colors.warning.main]} />}
      >
        <LinearGradient
          colors={[Colors.warning.main, Colors.warning[700]]}
          style={styles.summaryCard}
        >
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
              <Ionicons name="wallet-outline" size={48} color={Colors.neutral[300]} />
              <Text style={styles.emptyText}>No collections recorded today</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: Typography.sizes.lg, fontWeight: '800', color: Colors.text.primary },
  scrollContent: { padding: Spacing.lg },
  summaryCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    elevation: 8,
    shadowColor: Colors.warning.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4, fontWeight: '600' },
  statValue: { fontSize: 24, color: '#FFFFFF', fontWeight: '800' },
  divider: { width: 1, height: '70%', backgroundColor: 'rgba(255,255,255,0.2)' },
  section: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, padding: Spacing.lg, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.secondary, marginBottom: Spacing.lg, textTransform: 'uppercase', letterSpacing: 0.5 },
  customerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  customerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.warning[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: Colors.warning.main, fontWeight: '700', fontSize: 14 },
  customerName: { fontSize: 15, fontWeight: '600', color: Colors.text.primary },
  customerAmount: { fontSize: 13, color: Colors.text.tertiary, fontWeight: '500', marginTop: 2 },
  badge: { backgroundColor: Colors.warning[50], paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { color: Colors.warning.main, fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.md },
  emptyText: { color: Colors.text.tertiary, fontSize: 16, fontWeight: '500' }
});
