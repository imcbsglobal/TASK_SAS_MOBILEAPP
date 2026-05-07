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
import { BorderRadius, Colors, Gradients, Spacing, Typography } from '../../constants/theme';
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

        // Fetch Pending from AsyncStorage
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

        // Fetch Uploaded from API
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
        } catch (e) { console.log(`[Reports] Uploaded ${category} fetch error:`, e); }

        const all = [...pending, ...uploaded];
        let totalAmount = 0;
        let customerMap = {};

        all.forEach(item => {
          const amount = parseFloat(item.total || 0);
          totalAmount += amount;
          const custName = item.customer_name || item.customer || 'Unknown';
          customerMap[custName] = (customerMap[custName] || 0) + 1;
        });

        return { count: all.length, amount: totalAmount, customers: customerMap };
      };

      const fetchCollections = async () => {
        try {
          // Fetch Pending from Database
          await dbService.init();
          const pending = await dbService.getOfflineCollections(false);
          const todaysPending = pending.filter(item => {
            const itemDate = item.date?.split('T')[0];
            return itemDate === today;
          });

          // Fetch Saved (Uploaded) from SavedOrdersDB
          const saved = await savedOrdersDbService.getSavedTransactions('Collection');
          const todaysSaved = saved.filter(item => {
            const itemDate = (item.synced_at || item.date)?.split('T')[0];
            return itemDate === today;
          });

          const all = [...todaysPending, ...todaysSaved];
          let totalAmount = 0;
          let customerMap = {};

          all.forEach(item => {
            const amount = parseFloat(item.amount || 0);
            totalAmount += amount;
            const custName = item.customer_name || 'Unknown';
            customerMap[custName] = (customerMap[custName] || 0) + 1;
          });

          return { count: all.length, amount: totalAmount, customers: customerMap };
        } catch (e) {
          console.log('[Reports] Collection fetch error:', e);
          return { count: 0, amount: 0, customers: {} };
        }
      };

      const [orderRes, salesRes, returnRes, collectionRes] = await Promise.all([
        fetchSection('Order'),
        fetchSection('Sales'),
        fetchSection('Return'),
        fetchCollections()
      ]);

      let punchStatusData = { is_punched_in: false, firm_name: '', punchin_time: '' };
      try {
        const pResp = await fetch('https://tasksas.com/api/punch-status/', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (pResp.ok) {
          const pJson = await pResp.json();
          if (pJson.success && pJson.is_punched_in && pJson.data) {
            punchStatusData = {
              is_punched_in: true,
              firm_name: pJson.data.firm_name,
              punchin_time: pJson.data.punchin_time
            };
          }
        }
      } catch (e) { console.log('[Reports] Punch status fetch error:', e); }

      // Fetch Punch Attempt Logs count for today
      try {
        const logKey = `punch_attempt_logs_${username}`;
        const logsRaw = await AsyncStorage.getItem(logKey);
        if (logsRaw) {
          const allLogs = JSON.parse(logsRaw);
          const todayLogs = allLogs.filter(l => l.time?.split('T')[0] === today);
          setPunchLogCount({
            total: todayLogs.length,
            success: todayLogs.filter(l => l.status === 'success').length,
            failed: todayLogs.filter(l => l.status === 'failed').length,
          });
        } else {
          setPunchLogCount({ total: 0, success: 0, failed: 0 });
        }
      } catch (e) { console.log('[Reports] Punch logs fetch error:', e); }

      setReportData({
        orders: orderRes,
        sales: salesRes,
        returns: returnRes,
        collections: collectionRes,
        punchIn: punchStatusData
      });

    } catch (error) {
      console.error('[Reports] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDailyReport();
    }, [])
  );

  const renderCard = (title, data, icon, color, route) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => router.push(`/Reports/${route}`)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={[color + '15', color + '08']}
        style={styles.cardHeader}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
            <Ionicons name={icon} size={24} color={color} />
          </View>
          <Text style={[styles.cardTitle, { color: color }]}>{title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={color} />
      </LinearGradient>

      <View style={styles.cardContent}>
        {route === 'PunchReport' ? (
          <View style={styles.punchSummary}>
            <Text style={styles.statusText}>
              {data.is_punched_in ? 'Punched In' : 'Not Punched In'}
            </Text>
            {data.is_punched_in && (
              <Text style={styles.subText} numberOfLines={1}>
                at {data.firm_name}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Count</Text>
              <Text style={styles.statValue}>{data.count}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Amount</Text>
              <Text style={styles.statValue}>₹{data.amount.toLocaleString()}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Reports</Text>
        <TouchableOpacity onPress={fetchDailyReport} style={styles.refreshButton}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary.main} />
          ) : (
            <Ionicons name="refresh" size={24} color={Colors.primary.main} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchDailyReport} colors={[Colors.primary.main]} />
        }
      >
        <Text style={styles.dateText}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>

        {renderCard('Orders', reportData.orders, 'cube-outline', Colors.secondary.main, 'OrderReport')}
        {renderCard('Sales', reportData.sales, 'cart-outline', Colors.success.main, 'SalesReport')}
        {renderCard('Returns', reportData.returns, 'return-up-back-outline', Colors.primary.main, 'ReturnReport')}
        {renderCard('Collection', reportData.collections, 'wallet-outline', Colors.warning.main, 'CollectionReport')}
        {renderCard('Punch In', reportData.punchIn, 'finger-print', Colors.status.info || '#00BCD4', 'PunchReport')}

        {/* Punch Logs Card */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/Reports/PunchLogsReport')}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#7c3aed15', '#7c3aed08']}
            style={styles.cardHeader}
          >
            <View style={styles.headerLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#7c3aed20' }]}>
                <Ionicons name="list-circle-outline" size={24} color="#7c3aed" />
              </View>
              <Text style={[styles.cardTitle, { color: '#7c3aed' }]}>PUNCH LOGS</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7c3aed" />
          </LinearGradient>
          <View style={styles.cardContent}>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Today's Attempts</Text>
                <Text style={styles.statValue}>{punchLogCount.total}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Success</Text>
                <Text style={[styles.statValue, { color: '#16a34a' }]}>{punchLogCount.success}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Failed</Text>
                <Text style={[styles.statValue, { color: '#dc2626' }]}>{punchLogCount.failed}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Click on any card to view detailed reports</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  refreshButton: {
    padding: 4,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  dateText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 2,
    fontWeight: '600',
  },
  statValue: {
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  statDivider: {
    width: 1,
    height: '60%',
    backgroundColor: Colors.neutral[100],
  },
  punchSummary: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusText: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  subText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    paddingBottom: Spacing.xl,
  },
  footerText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
});
