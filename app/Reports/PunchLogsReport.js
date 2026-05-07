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

// Returns YYYY-MM-DD for today and yesterday
const getDateStrings = () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterday = yest.toISOString().split('T')[0];
  return { today, yesterday };
};

export default function PunchLogsReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('today'); // 'today' | 'yesterday'

  const { today, yesterday } = getDateStrings();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const username = await AsyncStorage.getItem('username');
      const logKey = `punch_attempt_logs_${username}`;
      const raw = await AsyncStorage.getItem(logKey);
      // Keep only last 2 days
      const parsed = raw ? JSON.parse(raw) : [];
      const filtered = parsed.filter(l => {
        const d = l.time?.split('T')[0];
        return d === today || d === yesterday;
      });
      setAllLogs(filtered);
    } catch (e) {
      console.error('[PunchLogsReport] Fetch error:', e);
      setAllLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchLogs(); }, []));

  // Logs filtered to selected day
  const displayedLogs = useMemo(() => {
    const dateStr = selectedDay === 'today' ? today : yesterday;
    return allLogs.filter(l => l.time?.split('T')[0] === dateStr);
  }, [allLogs, selectedDay, today, yesterday]);

  // Counts for selected day
  const successCount = displayedLogs.filter(l => l.status === 'success').length;
  const failedCount = displayedLogs.filter(l => l.status === 'failed').length;
  const totalCount = displayedLogs.length;

  // Count for tabs (badge)
  const todayCount = allLogs.filter(l => l.time?.split('T')[0] === today).length;
  const yesterdayCount = allLogs.filter(l => l.time?.split('T')[0] === yesterday).length;

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  const selectedDateLabel = selectedDay === 'today'
    ? new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : new Date(yesterday).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Punch Logs</Text>
        <TouchableOpacity onPress={fetchLogs} style={styles.refreshButton}>
          {loading
            ? <ActivityIndicator size="small" color={Colors.primary.main} />
            : <Ionicons name="refresh" size={24} color={Colors.primary.main} />}
        </TouchableOpacity>
      </View>

      {/* Day Filter Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, selectedDay === 'today' && styles.tabActive]}
          onPress={() => setSelectedDay('today')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, selectedDay === 'today' && styles.tabTextActive]}>
            Today
          </Text>
          {todayCount > 0 && (
            <View style={[styles.tabBadge, selectedDay === 'today' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, selectedDay === 'today' && styles.tabBadgeTextActive]}>
                {todayCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedDay === 'yesterday' && styles.tabActive]}
          onPress={() => setSelectedDay('yesterday')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, selectedDay === 'yesterday' && styles.tabTextActive]}>
            Yesterday
          </Text>
          {yesterdayCount > 0 && (
            <View style={[styles.tabBadge, selectedDay === 'yesterday' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, selectedDay === 'yesterday' && styles.tabBadgeTextActive]}>
                {yesterdayCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Summary Banner */}
      <LinearGradient colors={['#1e3a8a', '#2563eb']} style={styles.banner}>
        <Text style={styles.bannerDate}>{selectedDateLabel}</Text>
        <View style={styles.bannerRow}>
          <View style={styles.bannerStat}>
            <Text style={styles.bannerValue}>{totalCount}</Text>
            <Text style={styles.bannerLabel}>Total Attempts</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerStat}>
            <Text style={[styles.bannerValue, { color: '#4ade80' }]}>{successCount}</Text>
            <Text style={styles.bannerLabel}>Successful</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerStat}>
            <Text style={[styles.bannerValue, { color: '#f87171' }]}>{failedCount}</Text>
            <Text style={styles.bannerLabel}>Failed</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchLogs} colors={[Colors.primary.main]} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary.main} style={{ marginTop: 60 }} />
        ) : displayedLogs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={48} color={Colors.neutral?.[300] || '#CBD5E1'} />
            <Text style={styles.emptyTitle}>No Logs for {selectedDay === 'today' ? 'Today' : 'Yesterday'}</Text>
            <Text style={styles.emptySubtitle}>
              {selectedDay === 'today'
                ? 'Punch-in attempts today will appear here.'
                : 'No punch-in attempts were recorded yesterday.'}
            </Text>
          </View>
        ) : (
          displayedLogs.map((log, index) => {
            const isSuccess = log.status === 'success';
            const time = formatTime(log.time);
            return (
              <View
                key={index}
                style={[styles.logCard, isSuccess ? styles.successCard : styles.failedCard]}
              >
                {/* Top Row: Badge + Time */}
                <View style={styles.cardTopRow}>
                  <View style={[styles.badge, isSuccess ? styles.successBadge : styles.failedBadge]}>
                    <Ionicons
                      name={isSuccess ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={isSuccess ? '#16a34a' : '#dc2626'}
                    />
                    <Text style={[styles.badgeText, { color: isSuccess ? '#16a34a' : '#dc2626' }]}>
                      {isSuccess ? 'SUCCESS' : 'FAILED'}
                    </Text>
                  </View>
                  <View style={styles.timeBlock}>
                    <Ionicons name="time-outline" size={13} color={Colors.text?.tertiary || '#94a3b8'} />
                    <Text style={styles.timeText}>{time}</Text>
                  </View>
                </View>

                {/* Firm Name */}
                {!!log.firm_name && (
                  <View style={styles.infoRow}>
                    <Ionicons name="business-outline" size={15} color={Colors.text?.secondary || '#475569'} />
                    <Text style={styles.firmName} numberOfLines={1}>{log.firm_name}</Text>
                  </View>
                )}

                {/* Message */}
                {!!log.message && (
                  <View style={styles.infoRow}>
                    <Ionicons name="information-circle-outline" size={15} color={Colors.text?.tertiary || '#94a3b8'} />
                    <Text style={styles.messageText} numberOfLines={2}>{log.message}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral?.[200] || '#E2E8F0',
  },
  backButton: { padding: 4 },
  refreshButton: { padding: 4 },
  headerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: Colors.text.primary,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral?.[200] || '#E2E8F0',
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#1e3a8a',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text?.secondary || '#64748b',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    backgroundColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },

  // Banner
  banner: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  bannerDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bannerStat: {
    alignItems: 'center',
    flex: 1,
  },
  bannerValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bannerLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  bannerDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  // Scroll
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
  },

  // Empty
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl * 2,
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: Colors.neutral?.[200] || '#E2E8F0',
  },
  emptyTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.text?.tertiary || '#94a3b8',
    textAlign: 'center',
  },

  // Log Card
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  successCard: { borderLeftColor: '#16a34a' },
  failedCard: { borderLeftColor: '#dc2626' },

  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  successBadge: { backgroundColor: '#dcfce7' },
  failedBadge: { backgroundColor: '#fee2e2' },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text?.secondary || '#475569',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  firmName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
  },
  messageText: {
    fontSize: 12,
    color: Colors.text?.secondary || '#475569',
    flex: 1,
    lineHeight: 18,
  },
});
