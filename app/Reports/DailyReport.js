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
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Gradients, Spacing, Typography, Shadows } from '../../constants/theme';
import dbService from '../../src/services/database';
import savedOrdersDbService from '../../src/services/savedOrdersDb';

const { width } = Dimensions.get('window');

export default function DailyReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({
    orders: { count: 0, amount: 0, customers: {} },
    sales: { count: 0, amount: 0, customers: {} },
    returns: { count: 0, amount: 0, customers: {} },
    collections: { count: 0, amount: 0, customers: {} },
    punchIn: { is_punched_in: false, firm_name: '', punchin_time: '' }
  });
  const [punchLogCount, setPunchLogCount] = useState({ total: 0, success: 0, failed: 0 });

  const fetchDailyReport = async () => {
    try {
      setLoading(true);
      const username = await AsyncStorage.getItem("username");
      const clientId = await AsyncStorage.getItem("client_id");
      const token = await AsyncStorage.getItem("authToken");
      const today = new Date().toISOString().split('T')[0];

      if (!username || !token) return;

      const currentUsername = username.toLowerCase().trim();

      const fetchSection = async (category) => {
        let pending = [];
        let uploaded = [];

        let storageKey = "";
        if (category === 'Order') storageKey = `placed_orders_${username}`;
        else if (category === 'Sales') storageKey = `placed_sales_${username}`;
        else if (category === 'Return') storageKey = `return_orders_${username}`;

        const stored = await AsyncStorage.getItem(storageKey);
        if (stored) {
          pending = JSON.parse(stored).filter(item => {
            const itemDate = item.timestamp?.split('T')[0];
            return itemDate === today;
          });
        }

        let url = "";
        if (category === 'Order') url = `https://tasksas.com/api/item-orders/list-all?client_id=${clientId}`;
        else if (category === 'Sales') url = `https://tasksas.com/api/sales/list-all`;
        else if (category === 'Return') url = `https://tasksas.com/api/sales-return/list-all?client_id=${clientId}`;

        try {
          const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });
          if (resp.ok) {
            const json = await resp.json();
            let apiData = [];
            if (category === 'Order') apiData = json.orders || [];
            else if (category === 'Sales') apiData = json.sales || [];
            else if (category === 'Return') apiData = json.returns || [];

            uploaded = apiData.filter(item => {
              const apiUser = (item.username || '').toLowerCase().trim();
              const itemDate = item.created_date;
              return apiUser === currentUsername && itemDate === today;
            });
          }
        } catch (e) { console.log(`[DailyReport] Uploaded ${category} fetch error:`, e); }

        const all = [...pending, ...uploaded];
        let totalAmount = 0;
        let customerMap = {};

        all.forEach(item => {
          const amount = parseFloat(item.total || 0);
          totalAmount += amount;
          const name = item.customer_name || item.customer || 'Unknown';
          if (!customerMap[name]) customerMap[name] = { count: 0, amount: 0 };
          customerMap[name].count += 1;
          customerMap[name].amount += amount;
        });

        return { count: all.length, amount: totalAmount, customers: customerMap };
      };

      const [orders, sales, returns] = await Promise.all([
        fetchSection('Order'),
        fetchSection('Sales'),
        fetchSection('Return')
      ]);

      await dbService.init();
      const pendingColl = await dbService.getOfflineCollections(false);
      const savedColl = await savedOrdersDbService.getSavedTransactions('Collection');
      const allColl = [...pendingColl, ...savedColl].filter(item => {
        const d = (item.date || item.synced_at)?.split('T')[0];
        return d === today;
      });
      let collTotal = 0;
      allColl.forEach(c => collTotal += parseFloat(c.amount || 0));
      const collections = { count: allColl.length, amount: collTotal };

      let punchIn = { is_punched_in: false, firm_name: '', punchin_time: '' };
      try {
        const pResp = await fetch('https://tasksas.com/api/punch-status/', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (pResp.ok) {
          const pJson = await pResp.json();
          if (pJson.success && pJson.is_punched_in && pJson.data) {
            punchIn = {
              is_punched_in: true,
              firm_name: pJson.data.firm_name,
              punchin_time: pJson.data.punchin_time
            };
          }
        }
      } catch (e) {}

      const logKey = `punch_attempt_logs_${username}`;
      const logRaw = await AsyncStorage.getItem(logKey);
      const logParsed = logRaw ? JSON.parse(logRaw) : [];
      const logToday = logParsed.filter(l => l.time?.split('T')[0] === today);
      const punchLogs = {
        total: logToday.length,
        success: logToday.filter(l => l.status === 'success').length,
        failed: logToday.filter(l => l.status === 'failed').length
      };

      setReportData({ orders, sales, returns, collections, punchIn });
      setPunchLogCount(punchLogs);

    } catch (error) {
      console.error('[DailyReport] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDailyReport(); }, []));

  const formatCurrency = (val) => `₹${parseFloat(val || 0).toLocaleString('en-IN')}`;

  const renderKPI = (title, count, amount, icon, colors, route) => (
    <View style={styles.kpiWrapper}>
      <TouchableOpacity 
        style={styles.kpiCard} 
        onPress={() => router.push(route)}
        activeOpacity={0.7}
      >
        <View style={[styles.kpiIconContainer, { backgroundColor: colors[0] + '15' }]}>
          <Ionicons name={icon} size={24} color={colors[0]} />
        </View>
        <View style={styles.kpiContent}>
          <Text style={styles.kpiTitle}>{title}</Text>
          <Text style={styles.kpiAmount}>{formatCurrency(amount)}</Text>
          <Text style={styles.kpiCount}>{count} {count === 1 ? 'Record' : 'Records'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.neutral[300]} />
      </TouchableOpacity>
    </View>
  );

  const todayLabel = new Date().toLocaleDateString('en-IN', { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long' 
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header with Shadow Wrapper for iOS */}
      <View style={styles.headerShadowWrapper}>
        <LinearGradient colors={Gradients.primary} style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerAction}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Business Overview</Text>
            <TouchableOpacity onPress={fetchDailyReport} style={styles.headerAction}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerDateContainer}>
            <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.headerDate}>{todayLabel}</Text>
          </View>
        </LinearGradient>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDailyReport} tintColor={Colors.primary.main} />}
      >
        {/* Punch In Banner with Shadow Wrapper for iOS */}
        <View style={styles.punchBannerWrapper}>
          <TouchableOpacity 
            style={styles.punchBannerContainer}
            onPress={() => router.push('/Reports/PunchReport')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={reportData.punchIn.is_punched_in ? Gradients.success : Gradients.dark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.punchGradient}
            >
              <View style={styles.punchLeft}>
                <View style={styles.punchIconCircle}>
                  <Ionicons 
                    name={reportData.punchIn.is_punched_in ? "location" : "location-outline"} 
                    size={24} 
                    color="#FFFFFF" 
                  />
                </View>
                <View>
                  <Text style={styles.punchStatusLabel}>
                    {reportData.punchIn.is_punched_in ? 'ACTIVE PUNCH-IN' : 'NOT PUNCHED IN'}
                  </Text>
                  <Text style={styles.punchFirmName} numberOfLines={1}>
                    {reportData.punchIn.is_punched_in ? reportData.punchIn.firm_name : 'No active session'}
                  </Text>
                </View>
              </View>
              <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* KPI Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Performance Metrics</Text>
        </View>

        <View style={styles.kpiList}>
          {renderKPI('Total Orders', reportData.orders.count, reportData.orders.amount, 'cart', [Colors.primary.main], '/Reports/OrderReport')}
          {renderKPI('Total Sales', reportData.sales.count, reportData.sales.amount, 'receipt', [Colors.secondary.main], '/Reports/SalesReport')}
          {renderKPI('Sales Returns', reportData.returns.count, reportData.returns.amount, 'arrow-undo', [Colors.error.main], '/Reports/ReturnReport')}
          {renderKPI('Total Collections', reportData.collections.count, reportData.collections.amount, 'card', [Colors.success.main], '/Reports/CollectionReport')}
        </View>

        {/* Sync Status Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>System Status</Text>
        </View>

        <View style={styles.syncCardWrapper}>
          <TouchableOpacity 
            style={styles.syncCard}
            onPress={() => router.push('/Reports/PunchLogsReport')}
          >
            <View style={styles.syncHeader}>
              <View style={styles.syncLeft}>
                <View style={styles.syncIconContainer}>
                  <Ionicons name="sync" size={20} color={Colors.primary.main} />
                </View>
                <Text style={styles.syncTitle}>Punch Attempts</Text>
              </View>
              <View style={styles.syncBadges}>
                <View style={[styles.miniBadge, { backgroundColor: Colors.success[50] }]}>
                  <Text style={[styles.miniBadgeText, { color: Colors.success.main }]}>{punchLogCount.success}</Text>
                </View>
                <View style={[styles.miniBadge, { backgroundColor: Colors.error[50] }]}>
                  <Text style={[styles.miniBadgeText, { color: Colors.error.main }]}>{punchLogCount.failed}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.syncDescription}>
              Monitor your data synchronization attempts for today.
            </Text>
          </TouchableOpacity>
        </View>

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
    overflow: 'hidden', // Required for iOS rounded gradients
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  headerDate: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  punchBannerWrapper: {
    marginBottom: Spacing.xl,
    backgroundColor: 'transparent',
    ...Shadows.md,
  },
  punchBannerContainer: {
    borderRadius: 20,
    overflow: 'hidden', // Clip the gradient
  },
  punchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  punchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  punchIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  punchStatusLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
  punchFirmName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
    width: width * 0.5,
  },
  sectionHeader: {
    marginBottom: Spacing.lg,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.3,
  },
  kpiList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  kpiWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.sm,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  kpiIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  kpiContent: {
    flex: 1,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: 2,
  },
  kpiCount: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  syncCardWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.sm,
  },
  syncCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  syncLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  syncIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  syncBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 24,
    alignItems: 'center',
  },
  miniBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  syncDescription: {
    fontSize: 13,
    color: Colors.text.tertiary,
    lineHeight: 18,
    paddingLeft: 44,
  },
});
