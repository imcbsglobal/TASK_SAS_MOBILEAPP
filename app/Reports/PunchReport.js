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

export default function PunchReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ is_punched_in: false, firm_name: '', punchin_time: '' });
  const [history, setHistory] = useState([]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const pResp = await fetch('https://tasksas.com/api/punch-status/', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (pResp.ok) {
        const pJson = await pResp.json();
        if (pJson.success && pJson.is_punched_in && pJson.data) {
          setData({
            is_punched_in: true,
            firm_name: pJson.data.firm_name,
            punchin_time: pJson.data.punchin_time
          });
        } else {
          setData({ is_punched_in: false, firm_name: '', punchin_time: '' });
        }
      }

      // Fetch History
      const username = await AsyncStorage.getItem("username");
      const historyKey = `punch_history_${username}`;
      const historyRaw = await AsyncStorage.getItem(historyKey);
      if (historyRaw) {
        setHistory(JSON.parse(historyRaw));
      } else {
        setHistory([]);
      }
    } catch (e) {
      console.log('[PunchReport] Fetch error:', e);
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
        <Text style={styles.headerTitle}>Punch-In Report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchReport} colors={[Colors.status.info]} />}
      >
        <LinearGradient
          colors={[Colors.status.info || '#06B6D4', '#3B82F6']}
          style={styles.summaryCard}
        >
          <View style={styles.statusHeader}>
            <View style={styles.iconCircle}>
              <Ionicons 
                name={data.is_punched_in ? "finger-print" : "log-out-outline"} 
                size={40} 
                color="#FFFFFF" 
              />
            </View>
            <Text style={styles.statusTitle}>
              {data.is_punched_in ? 'Currently Punched In' : 'Currently Not Punched In'}
            </Text>
          </View>
        </LinearGradient>

        {data.is_punched_in ? (
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="business" size={24} color={Colors.status.info} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Firm Name</Text>
                <Text style={styles.detailValue}>{data.firm_name}</Text>
              </View>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="time" size={24} color={Colors.status.info} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Punch-In Time</Text>
                <Text style={styles.detailValue}>
                  {data.punchin_time ? new Date(data.punchin_time).toLocaleString() : 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="alert-circle-outline" size={32} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>No active punch-in found.</Text>
            <TouchableOpacity 
              style={styles.punchBtn}
              onPress={() => router.push("/Punch-In")}
            >
              <Text style={styles.punchBtnText}>Go to Punch-In Page</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History Section */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color={Colors.text.primary} />
            <Text style={styles.sectionTitle}>Recent Punch History</Text>
          </View>

          {history.length > 0 ? (
            history.map((item, index) => (
              <View key={item.id || index} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyFirmInfo}>
                    <Ionicons name="business" size={16} color={Colors.status.info} />
                    <Text style={styles.historyFirmName} numberOfLines={1}>
                      {item.firm_name}
                    </Text>
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
                      <Ionicons name="log-out" size={14} color={Colors.error.main} />
                      <Text style={styles.timeText}>
                        Out: {new Date(item.punchout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  )}
                  <View style={styles.dateRow}>
                    <Text style={styles.dateText}>
                      {new Date(item.punchin_time).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noHistoryCard}>
              <Ionicons name="calendar-outline" size={32} color={Colors.neutral[300]} />
              <Text style={styles.noHistoryText}>No punch history recorded yet.</Text>
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
    shadowColor: Colors.status.info || '#06B6D4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  statusHeader: { alignItems: 'center', gap: Spacing.md },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  statusTitle: { fontSize: 20, color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  detailCard: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, padding: Spacing.lg, elevation: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  detailIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F9FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  detailValue: { fontSize: 16, color: Colors.text.primary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.neutral[100], marginLeft: 60 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.lg },
  emptyText: { fontSize: 15, color: Colors.text.secondary, textAlign: 'center' },
  punchBtn: { backgroundColor: Colors.status.info || '#06B6D4', paddingHorizontal: 24, paddingVertical: 12, borderRadius: BorderRadius.lg },
  punchBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  historySection: { marginTop: Spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.text.primary },
  historyItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
    elevation: 1,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  historyFirmInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  historyFirmName: { fontSize: 15, fontWeight: '700', color: Colors.text.primary, flex: 1 },
  durationBadge: { backgroundColor: '#F0F9FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeBadge: { backgroundColor: '#ECFDF5' },
  durationText: { fontSize: 12, fontWeight: '700', color: Colors.status.info || '#06B6D4' },
  historyDetails: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: Colors.neutral[50], paddingTop: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 13, color: Colors.text.secondary, fontWeight: '500' },
  dateRow: { marginLeft: 'auto' },
  dateText: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '600' },
  noHistoryCard: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, borderStyle: 'dashed', borderWidth: 2, borderColor: Colors.neutral[200] },
  noHistoryText: { fontSize: 14, color: Colors.text.tertiary, fontWeight: '500' }
});
