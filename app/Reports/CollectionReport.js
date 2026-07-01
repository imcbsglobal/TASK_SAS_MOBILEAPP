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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Spacing, Typography, Gradients, Shadows } from '../../constants/theme';
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.headerShadowWrapper}>
        <LinearGradient
          colors={Gradients.success}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerAction}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Collection Report</Text>
              <Text style={styles.headerSubtitle}>{selectedDateLabel}</Text>
            </View>
            <TouchableOpacity onPress={fetchReport} style={styles.headerAction}>
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="refresh" size={22} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.tabContainer}>
            <View style={styles.tabBackground}>
              <TouchableOpacity
                style={[styles.tab, selectedDay === 'today' && styles.activeTab]}
                onPress={() => setSelectedDay('today')}
              >
                <Text style={[styles.tabText, selectedDay === 'today' && styles.activeTabText]}>Today</Text>
                {todayCount > 0 && (
                  <View style={[styles.badge, selectedDay === 'today' ? styles.activeBadge : styles.inactiveBadge]}>
                    <Text style={[styles.badgeText, selectedDay === 'today' && styles.activeBadgeText]}>{todayCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, selectedDay === 'yesterday' && styles.activeTab]}
                onPress={() => setSelectedDay('yesterday')}
              >
                <Text style={[styles.tabText, selectedDay === 'yesterday' && styles.activeTabText]}>Yesterday</Text>
                {yesterdayCount > 0 && (
                  <View style={[styles.badge, selectedDay === 'yesterday' ? styles.activeBadge : styles.inactiveBadge]}>
                    <Text style={[styles.badgeText, selectedDay === 'yesterday' && styles.activeBadgeText]}>{yesterdayCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={loading} 
            onRefresh={fetchReport} 
            tintColor={Colors.success.main}
          />
        }
      >
        <View style={styles.statsContainer}>
          <View style={styles.statWrapper}>
            <View style={[styles.statCard, { borderLeftColor: Colors.success.main }]}>
              <View style={[styles.statIconContainer, { backgroundColor: Colors.success[50] }]}>
                <Ionicons name="card" size={20} color={Colors.success.main} />
              </View>
              <View>
                <Text style={styles.statLabel}>Total Collections</Text>
                <Text style={styles.statValue}>{data.count}</Text>
              </View>
            </View>
          </View>
          <View style={styles.statWrapper}>
            <View style={[styles.statCard, { borderLeftColor: Colors.success.main }]}>
              <View style={[styles.statIconContainer, { backgroundColor: Colors.success[50] }]}>
                <Ionicons name="wallet" size={20} color={Colors.success.main} />
              </View>
              <View>
                <Text style={styles.statLabel}>Total Collected</Text>
                <Text style={[styles.statValue, { color: Colors.success.main }]}>
                  {data.amount.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Collection History</Text>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{Object.keys(data.customers).length} Customers</Text>
          </View>
        </View>

        {Object.keys(data.customers).length > 0 ? (
          Object.entries(data.customers).map(([name, stats], index) => (
            <View key={index} style={styles.customerCardWrapper}>
              <TouchableOpacity style={styles.customerCard}>
                <View style={styles.customerHeader}>
                  <View style={styles.avatarContainer}>
                    <LinearGradient
                      colors={[Colors.success[50], Colors.success[100]]}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  </View>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.orderCount}>{stats.count} {stats.count === 1 ? 'Transaction' : 'Transactions'}</Text>
                  </View>
                  <View style={styles.amountContainer}>
                    <Text style={styles.amountLabel}>Total Collected</Text>
                    <Text style={styles.amountValue}>{stats.amount.toLocaleString('en-IN')}</Text>
                  </View>
                </View>
                
                <View style={styles.transactionList}>
                  {stats.transactions.map((t, idx) => (
                    <View key={idx} style={styles.transactionItem}>
                      <View style={styles.typeTag}>
                        <Ionicons 
                          name={t.type === 'Cash' ? 'cash-outline' : 'business-outline'} 
                          size={12} 
                          color={Colors.text.tertiary} 
                        />
                        <Text style={styles.typeText}>{t.type}</Text>
                      </View>
                      <Text style={styles.transactionAmount}>{t.amount.toLocaleString('en-IN')}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: t.status === 'Uploaded' ? Colors.success[50] : Colors.warning[50] }]}>
                        <Text style={[styles.statusText, { color: t.status === 'Uploaded' ? Colors.success.main : Colors.warning.main }]}>
                          {t.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="card-outline" size={40} color={Colors.text.tertiary} />
            </View>
            <Text style={styles.emptyTitle}>No Collections Found</Text>
            <Text style={styles.emptySubtitle}>
              There are no payment collection records for {selectedDay === 'today' ? 'today' : 'yesterday'}.
            </Text>
          </View>
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerShadowWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.lg,
    zIndex: 10,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    fontWeight: '500',
  },
  tabContainer: {
    marginTop: 5,
  },
  tabBackground: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 15,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    ...Shadows.sm,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  activeTabText: {
    color: Colors.success.main,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  activeBadge: {
    backgroundColor: Colors.success[50],
  },
  inactiveBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  activeBadgeText: {
    color: Colors.success.main,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
    ...Shadows.md,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  sectionBadge: {
    backgroundColor: Colors.neutral[100],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  customerCardWrapper: {
    marginBottom: Spacing.md,
    backgroundColor: 'transparent',
    ...Shadows.sm,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    marginRight: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.success.main,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  orderCount: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  amountValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: 1,
  },
  transactionList: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: Spacing.sm,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 60,
  },
  typeText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  transactionAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
