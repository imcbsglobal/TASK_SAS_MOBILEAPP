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
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
};

export default function PunchReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [allPunches, setAllPunches] = useState([]);
  const [selectedDay, setSelectedDay] = useState('today');
  const [currentPunch, setCurrentPunch] = useState(null);

  const { today, yesterday } = getDateStrings();

  const fetchPunches = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return;

      // Current Status
      try {
        const statusResp = await fetch('https://tasksas.com/api/punch-status/', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (statusResp.ok) {
          const sJson = await statusResp.json();
          if (sJson.success && sJson.is_punched_in) setCurrentPunch(sJson.data);
          else setCurrentPunch(null);
        }
      } catch (e) {}

      // History
      const resp = await fetch('https://tasksas.com/api/punch-report/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const json = await resp.json();
        setAllPunches(json.data || []);
      }
    } catch (error) {
      console.error('[PunchReport] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchPunches(); }, []));

  const filteredPunches = useMemo(() => {
    const target = selectedDay === 'today' ? today : yesterday;
    return allPunches.filter(p => p.punchin_time?.split('T')[0] === target);
  }, [allPunches, selectedDay]);

  const selectedDateLabel = selectedDay === 'today'
    ? new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : new Date(yesterday).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.headerShadowWrapper}>
        <LinearGradient
          colors={Gradients.accent}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerAction}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Punch Report</Text>
              <Text style={styles.headerSubtitle}>{selectedDateLabel}</Text>
            </View>
            <TouchableOpacity onPress={fetchPunches} style={styles.headerAction}>
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPunches} tintColor={Colors.accent.main} />}
      >
        {/* Active Session with iOS Shadow Fix */}
        {currentPunch && (
          <View style={styles.activeCardWrapper}>
            <LinearGradient
              colors={Gradients.success}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeCard}
            >
              <View style={styles.activeHeader}>
                <View style={styles.activeIndicator} />
                <Text style={styles.activeTitle}>Currently Punched-In</Text>
              </View>
              <Text style={styles.activeFirmName}>{currentPunch.firm_name}</Text>
              <View style={styles.activeFooter}>
                <View style={styles.activeTimeBox}>
                  <Ionicons name="time-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.activeTimeText}>Started at {formatTime(currentPunch.punchin_time)}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.activeAction}
                  onPress={() => router.push('/Punch-In')}
                >
                  <Text style={styles.activeActionText}>View Details</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Punch History</Text>
          <Text style={styles.sectionBadge}>{filteredPunches.length} Sessions</Text>
        </View>

        {filteredPunches.length > 0 ? (
          filteredPunches.map((punch, index) => (
            <View key={index} style={styles.historyCardWrapper}>
              <View style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <View style={styles.timelineContainer}>
                    <View style={styles.timelineDot} />
                    <View style={styles.timelineLine} />
                    <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                  </View>
                  <View style={styles.historyContent}>
                    <Text style={styles.historyFirmName} numberOfLines={1}>{punch.firm_name}</Text>
                    <View style={styles.historyTimeRow}>
                      <Text style={styles.historyTimeLabel}>In:</Text>
                      <Text style={styles.historyTimeValue}>{formatTime(punch.punchin_time)}</Text>
                      <Text style={styles.historyTimeLabel}>Out:</Text>
                      <Text style={styles.historyTimeValue}>{formatTime(punch.punchout_time)}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.historyRight}>
                  <View style={styles.durationBadge}>
                    <Ionicons name="map-outline" size={12} color={Colors.accent.main} />
                    <Text style={styles.durationText}>Captured</Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="location-outline" size={40} color={Colors.text.tertiary} />
            </View>
            <Text style={styles.emptyTitle}>No History Found</Text>
            <Text style={styles.emptySubtitle}>No punch-in sessions recorded for this day.</Text>
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
    color: Colors.accent.main,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  activeCardWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.md,
    marginBottom: Spacing.xl,
  },
  activeCard: {
    borderRadius: 24,
    padding: Spacing.xl,
    overflow: 'hidden',
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  activeTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activeFirmName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: Spacing.lg,
  },
  activeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeTimeText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  activeAction: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  activeActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success.main,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    backgroundColor: Colors.neutral[100],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  historyCardWrapper: {
    backgroundColor: 'transparent',
    ...Shadows.sm,
    marginBottom: Spacing.md,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timelineContainer: {
    width: 20,
    alignItems: 'center',
    marginRight: 15,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent.main,
  },
  timelineLine: {
    width: 2,
    height: 12,
    backgroundColor: '#F1F5F9',
  },
  timelineDotEnd: {
    backgroundColor: Colors.text.tertiary,
    opacity: 0.3,
  },
  historyContent: {
    flex: 1,
  },
  historyFirmName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  historyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyTimeLabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
  historyTimeValue: {
    fontSize: 11,
    color: Colors.text.primary,
    fontWeight: '700',
    marginRight: 8,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.accent.main,
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
