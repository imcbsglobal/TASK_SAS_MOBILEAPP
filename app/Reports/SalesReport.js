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
    const amt = parseFloat(item.total || 0);
    totalAmount += amt;
    const name = item.customer_name || item.customer || 'Unknown';
    if (!customerMap[name]) customerMap[name] = { count: 0, amount: 0 };
    customerMap[name].count += 1;
    customerMap[name].amount += amt;
  });
  return { count: items.length, amount: totalAmount, customers: customerMap };
};

export default function SalesReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [allData, setAllData] = useState({ today: [], yesterday: [] });
  const [selectedDay, setSelectedDay] = useState('today');
  const { today, yesterday } = getDateStrings();

  const fetchReport = async () => {
    try {
      setLoading(true);
      const username = await AsyncStorage.getItem('username');
      const token = await AsyncStorage.getItem('authToken');
      if (!username || !token) return;
      const currentUsername = username.toLowerCase().trim();

      let pending = [];
      const stored = await AsyncStorage.getItem(`placed_sales_${username}`);
      if (stored) {
        pending = JSON.parse(stored).filter(item => {
          const d = item.timestamp?.split('T')[0];
          return d === today || d === yesterday;
        });
      }

      let uploaded = [];
      try {
        const resp = await fetch('https://tasksas.com/api/sales/list-all', {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (resp.ok) {
          const json = await resp.json();
          uploaded = (json.sales || []).filter(item => {
            const apiUser = (item.username || '').toLowerCase().trim();
            const d = item.created_date;
            return apiUser === currentUsername && (d === today || d === yesterday);
          });
        }
      } catch (e) { console.log('[SalesReport] API error:', e); }

      const all = [...pending, ...uploaded];
      setAllData({
        today: all.filter(i => (i.timestamp || i.created_date)?.split('T')[0] === today),
        yesterday: all.filter(i => (i.timestamp || i.created_date)?.split('T')[0] === yesterday),
      });
    } catch (error) {
      console.error('[SalesReport] Error:', error);
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
          colors={Gradients.primary}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerAction}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Sales Report</Text>
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
            tintColor={Colors.primary.main}
          />
        }
      >
        <View style={styles.statsContainer}>
          <View style={styles.statWrapper}>
            <View style={[styles.statCard, { borderLeftColor: Colors.primary.main }]}>
              <View style={styles.statIconContainer}>
                <Ionicons name="receipt" size={20} color={Colors.primary.main} />
              </View>
              <View>
                <Text style={styles.statLabel}>Total Sales</Text>
                <Text style={styles.statValue}>{data.count}</Text>
              </View>
            </View>
          </View>
          <View style={styles.statWrapper}>
            <View style={[styles.statCard, { borderLeftColor: Colors.success.main }]}>
              <View style={[styles.statIconContainer, { backgroundColor: Colors.success[50] }]}>
                <Ionicons name="cash" size={20} color={Colors.success.main} />
              </View>
              <View>
                <Text style={styles.statLabel}>Total Revenue</Text>
                <Text style={[styles.statValue, { color: Colors.success.main }]}>
                  {data.amount.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Customer Breakdown</Text>
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
                      colors={[Colors.primary[100], Colors.primary[200]]}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  </View>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.orderCount}>{stats.count} {stats.count === 1 ? 'Invoice' : 'Invoices'}</Text>
                  </View>
                  <View style={styles.amountContainer}>
                    <Text style={styles.amountLabel}>Total Value</Text>
                    <Text style={styles.amountValue}>{stats.amount.toLocaleString('en-IN')}</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.progressBarBg}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { width: `${Math.min((stats.amount / (data.amount || 1)) * 100, 100)}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.percentageText}>
                    {((stats.amount / (data.amount || 1)) * 100).toFixed(1)}% share
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="bar-chart-outline" size={40} color={Colors.text.tertiary} />
            </View>
            <Text style={styles.emptyTitle}>No Sales Found</Text>
            <Text style={styles.emptySubtitle}>
              There are no sales records for {selectedDay === 'today' ? 'today' : 'yesterday'}.
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
    color: Colors.primary.main,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  activeBadge: {
    backgroundColor: Colors.primary[50],
  },
  inactiveBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  activeBadgeText: {
    color: Colors.primary.main,
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
    backgroundColor: Colors.primary[50],
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
    color: Colors.primary.main,
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
  cardFooter: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary.main,
    borderRadius: 2,
  },
  percentageText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.tertiary,
    width: 55,
    textAlign: 'right',
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
