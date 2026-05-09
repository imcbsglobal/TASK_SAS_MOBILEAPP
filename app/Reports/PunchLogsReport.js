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

const formatTime = (isoString) => {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch { return '—'; }
};

export default function PunchLogsReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('today');

  const { today, yesterday } = getDateStrings();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const username = await AsyncStorage.getItem('username');
      const logKey = `punch_attempt_logs_${username}`;
      const raw = await AsyncStorage.getItem(logKey);
      setAllLogs(raw ? JSON.parse(raw) : []);
    } catch (e) {
      console.error('[PunchLogs] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchLogs(); }, []));

  const filteredLogs = useMemo(() => {
    const target = selectedDay === 'today' ? today : yesterday;
    return allLogs.filter(l => l.time?.split('T')[0] === target).reverse();
  }, [allLogs, selectedDay]);

  const stats = useMemo(() => {
    const s = filteredLogs.filter(l => l.status === 'success').length;
    const f = filteredLogs.filter(l => l.status === 'failed').length;
    return { success: s, failed: f, total: filteredLogs.length };
  }, [filteredLogs]);

  const selectedDateLabel = selectedDay === 'today'
    ? new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : new Date(yesterday).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.headerShadowWrapper}>
        <LinearGradient
          colors={Gradients.dark}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerAction}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Punch Logs</Text>
              <Text style={styles.headerSubtitle}>{selectedDateLabel}</Text>
            </View>
            <TouchableOpacity onPress={fetchLogs} style={styles.headerAction}>
              {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="refresh" size={22} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>

          <View style={styles.tabContainer}>
            <View style={styles.tabBackground}>
              <TouchableOpacity
                style={[styles.tab, selectedDay === 'today' && styles.activeTab]}
                onPress={() => setSelectedDay('today')}
              >
                <Text style={[styles.tabText, selectedDay === 'today' && styles.activeTabText]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, selectedDay === 'yesterday' && styles.activeTab]}
                onPress={() => setSelectedDay('yesterday')}
              >
                <Text style={[styles.tabText, selectedDay === 'yesterday' && styles.activeTabText]}>Yesterday</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor={Colors.neutral[800]} />}
      >
        <View style={styles.statsRow}>
          <View style={styles.statBoxWrapper}>
            <View style={[styles.statBox, { borderBottomColor: Colors.success.main }]}>
              <Text style={styles.statValue}>{stats.success}</Text>
              <Text style={styles.statLabel}>Success</Text>
            </View>
          </View>
          <View style={styles.statBoxWrapper}>
            <View style={[styles.statBox, { borderBottomColor: Colors.error.main }]}>
              <Text style={styles.statValue}>{stats.failed}</Text>
              <Text style={styles.statLabel}>Failed</Text>
            </View>
          </View>
          <View style={styles.statBoxWrapper}>
            <View style={[styles.statBox, { borderBottomColor: Colors.primary.main }]}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>

        {filteredLogs.length > 0 ? (
          filteredLogs.map((log, index) => (
            <View key={index} style={styles.logCardWrapper}>
              <View style={styles.logCard}>
                <View style={styles.logHeader}>
                  <View style={[styles.statusIndicator, { backgroundColor: log.status === 'success' ? Colors.success.main : Colors.error.main }]} />
                  <Text style={styles.logTime}>{formatTime(log.time)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: log.status === 'success' ? Colors.success[50] : Colors.error[50] }]}>
                    <Text style={[styles.statusText, { color: log.status === 'success' ? Colors.success.main : Colors.error.main }]}>
                      {log.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.logFirmName} numberOfLines={1}>{log.firm_name || 'System Sync'}</Text>
                <View style={styles.logDetails}>
                  <Ionicons 
                    name={log.status === 'success' ? "checkmark-circle-outline" : "alert-circle-outline"} 
                    size={14} 
                    color={Colors.text.tertiary} 
                  />
                  <Text style={styles.logMessage} numberOfLines={2}>{log.message}</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="terminal-outline" size={40} color={Colors.text.tertiary} />
            </View>
            <Text style={styles.emptyTitle}>No Logs Found</Text>
            <Text style={styles.emptySubtitle}>No synchronization attempts recorded.</Text>
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
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 15,
    padding: 4,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
    color: Colors.neutral[900],
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statBoxWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
    ...Shadows.sm,
  },
  statBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    overflow: 'hidden',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  logCardWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.sm,
    marginBottom: Spacing.md,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  logTime: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logFirmName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  logDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logMessage: {
    fontSize: 12,
    color: Colors.text.tertiary,
    lineHeight: 16,
    flex: 1,
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
  },
});
