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
  return { today, yesterday: yest.toISOString().split('T')[0] };
};

export default function PunchReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [currentStatus, setCurrentStatus] = useState({ is_punched_in: false, firm_name: '', punchin_time: '' });
  const [allHistory, setAllHistory] = useState([]);
  const [selectedDay, setSelectedDay] = useState('today');

  const { today, yesterday } = getDateStrings();

  const fetchReport = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return;

      // Current punch status
      try {
        const pResp = await fetch('https://tasksas.com/api/punch-status/', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (pResp.ok) {
          const pJson = await pResp.json();
          if (pJson.success && pJson.is_punched_in && pJson.data) {
            setCurrentStatus({
              is_punched_in: true,
              firm_name: pJson.data.firm_name,
              punchin_time: pJson.data.punchin_time,
            });
          } else {
            setCurrentStatus({ is_punched_in: false, firm_name: '', punchin_time: '' });
          }
        }
      } catch (e) {
        console.log('[PunchReport] Status fetch error:', e);
      }

      // Punch history
      const username = await AsyncStorage.getItem('username');
      const historyKey = `punch_history_${username}`;
      const historyRaw = await AsyncStorage.getItem(historyKey);
      if (historyRaw) {
        const all = JSON.parse(historyRaw);
        // Keep only today + yesterday
        const filtered = all.filter(item => {
          const d = item.punchin_time?.split('T')[0];
          return d === today || d === yesterday;
        });
        setAllHistory(filtered);
      } else {
        setAllHistory([]);
      }
    } catch (e) {
      console.log('[PunchReport] Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchReport(); }, []));

  // Filter history by selected day
  const displayedHistory = useMemo(() => {
    const dateStr = selectedDay === 'today' ? today : yesterday;
    return allHistory.filter(item => item.punchin_time?.split('T')[0] === dateStr);
  }, [allHistory, selectedDay, today, yesterday]);

  // Count per tab for badge
  const todayCount = allHistory.filter(i => i.punchin_time?.split('T')[0] === today).length;
  const yesterdayCount = allHistory.filter(i => i.punchin_time?.split('T')[0] === yesterday).length;

  // Total hours for selected day
  const totalHours = displayedHistory.reduce((sum, item) => sum + parseFloat(item.duration || 0), 0);

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
        <Text style={styles.headerTitle}>Punch-In Report</Text>
        <TouchableOpacity onPress={fetchReport} style={styles.refreshButton}>
          {loading
            ? <ActivityIndicator size="small" color={Colors.status.info || '#06B6D4'} />
            : <Ionicons name="refresh" size={24} color={Colors.status.info || '#06B6D4'} />}
        </TouchableOpacity>
      </View>

      {/* Day Filter Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, selectedDay === 'today' && styles.tabActive]}
          onPress={() => setSelectedDay('today')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, selectedDay === 'today' && styles.tabTextActive]}>Today</Text>
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
          <Text style={[styles.tabText, selectedDay === 'yesterday' && styles.tabTextActive]}>Yesterday</Text>
          {yesterdayCount > 0 && (
            <View style={[styles.tabBadge, selectedDay === 'yesterday' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, selectedDay === 'yesterday' && styles.tabBadgeTextActive]}>
                {yesterdayCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchReport} colors={[Colors.status.info || '#06B6D4']} />
        }
      >
        {/* Summary Banner */}
        <LinearGradient
          colors={[Colors.status.info || '#06B6D4', '#3B82F6']}
          style={styles.summaryCard}
        >
          <Text style={styles.bannerDate}>{selectedDateLabel}</Text>
          <View style={styles.bannerRow}>
            <View style={styles.bannerStat}>
              <Text style={styles.bannerValue}>{displayedHistory.length}</Text>
              <Text style={styles.bannerLabel}>Total Punch-Ins</Text>
            </View>
            <View style={styles.bannerDivider} />
            <View style={styles.bannerStat}>
              <Text style={styles.bannerValue}>
                {displayedHistory.filter(i => !i.punchout_time).length}
              </Text>
              <Text style={styles.bannerLabel}>Active</Text>
            </View>
            <View style={styles.bannerDivider} />
            <View style={styles.bannerStat}>
              <Text style={styles.bannerValue}>{totalHours.toFixed(1)}</Text>
              <Text style={styles.bannerLabel}>Total Hrs</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Current Status — only show if today is selected */}
        {selectedDay === 'today' && (
          currentStatus.is_punched_in ? (
            <View style={styles.activeCard}>
              <View style={styles.activeDot} />
              <View style={styles.activeInfo}>
                <Text style={styles.activeLabel}>Currently Punched In</Text>
                <Text style={styles.activeFirm} numberOfLines={1}>{currentStatus.firm_name}</Text>
                <Text style={styles.activeTime}>
                  Since {currentStatus.punchin_time
                    ? new Date(currentStatus.punchin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'N/A'}
                </Text>
              </View>
              <Ionicons name="finger-print" size={36} color={Colors.status.info || '#06B6D4'} />
            </View>
          ) : (
            <View style={styles.notActiveCard}>
              <Ionicons name="log-out-outline" size={22} color={Colors.text.tertiary} />
              <Text style={styles.notActiveText}>Not currently punched in</Text>
              <TouchableOpacity style={styles.punchBtn} onPress={() => router.push('/Punch-In')}>
                <Text style={styles.punchBtnText}>Go to Punch-In</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* History for selected day */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color={Colors.text.primary} />
            <Text style={styles.sectionTitle}>
              {selectedDay === 'today' ? "Today's" : "Yesterday's"} Punch History
            </Text>
          </View>

          {displayedHistory.length > 0 ? (
            displayedHistory.map((item, index) => (
              <View key={item.id || index} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyFirmInfo}>
                    <Ionicons name="business" size={16} color={Colors.status.info || '#06B6D4'} />
                    <Text style={styles.historyFirmName} numberOfLines={1}>{item.firm_name}</Text>
                  </View>
                  <View style={[styles.durationBadge, !item.punchout_time && styles.activeBadge]}>
                    <Text style={styles.durationText}>
                      {item.punchout_time
                        ? `${parseFloat(item.duration || 0).toFixed(2)} hrs`
                        : 'Active'}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyDetails}>
                  <View style={styles.timeRow}>
                    <Ionicons name="log-in" size={14} color={Colors.success.main} />
                    <Text style={styles.timeText}>
                      In: {new Date(item.punchin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {item.punchout_time && (
                    <View style={styles.timeRow}>
                      <Ionicons name="log-out" size={14} color={Colors.error?.main || '#ef4444'} />
                      <Text style={styles.timeText}>
                        Out: {new Date(item.punchout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noHistoryCard}>
              <Ionicons name="calendar-outline" size={32} color={Colors.neutral?.[300] || '#CBD5E1'} />
              <Text style={styles.noHistoryText}>
                No punch history for {selectedDay === 'today' ? 'today' : 'yesterday'}.
              </Text>
            </View>
          )}
        </View>
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
  headerTitle: { fontSize: Typography.sizes.lg, fontWeight: '800', color: Colors.text.primary },

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
  tabActive: { backgroundColor: Colors.status.info || '#06B6D4' },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.text?.secondary || '#64748b' },
  tabTextActive: { color: '#FFFFFF' },
  tabBadge: {
    backgroundColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  tabBadgeTextActive: { color: '#FFFFFF' },

  // Scroll
  scrollContent: { padding: Spacing.lg, gap: Spacing.lg },

  // Summary Banner
  summaryCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    elevation: 8,
    shadowColor: Colors.status.info || '#06B6D4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  bannerDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bannerStat: { alignItems: 'center', flex: 1 },
  bannerValue: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  bannerLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  bannerDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },

  // Active status card
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.status.info || '#06B6D4',
    elevation: 2,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
  },
  activeInfo: { flex: 1 },
  activeLabel: { fontSize: 11, fontWeight: '700', color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5 },
  activeFirm: { fontSize: 16, fontWeight: '800', color: Colors.text.primary, marginTop: 2 },
  activeTime: { fontSize: 12, color: Colors.text?.secondary || '#64748b', marginTop: 2 },

  notActiveCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    elevation: 1,
  },
  notActiveText: { fontSize: 14, color: Colors.text?.secondary || '#64748b' },
  punchBtn: {
    backgroundColor: Colors.status.info || '#06B6D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    marginTop: 4,
  },
  punchBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // History
  historySection: { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text.primary },

  historyItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.neutral?.[100] || '#F1F5F9',
    elevation: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyFirmInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  historyFirmName: { fontSize: 15, fontWeight: '700', color: Colors.text.primary, flex: 1 },
  durationBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadge: { backgroundColor: '#ECFDF5' },
  durationText: { fontSize: 12, fontWeight: '700', color: Colors.status.info || '#06B6D4' },

  historyDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral?.[50] || '#F8FAFC',
    paddingTop: 8,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 13, color: Colors.text?.secondary || '#64748b', fontWeight: '500' },

  noHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: Colors.neutral?.[200] || '#E2E8F0',
  },
  noHistoryText: { fontSize: 14, color: Colors.text?.tertiary || '#94a3b8', fontWeight: '500' },
});
