// app/Collection/Collection.js
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect } from "react";
import {
  BackHandler,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";

export default function CollectionScreen() {

  const router = useRouter();
  const params = useGlobalSearchParams();
  const preselectedCustomerCode = params?.preselectedCustomerCode || null;

  // Handle Android back button
  useEffect(() => {
    const backAction = () => {
      if (preselectedCustomerCode) {
        router.back();
      } else {
        router.replace("/(tabs)/Home");
      }
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [preselectedCustomerCode, router]);

  const sections = [
    {
      id: 1,
      title: "Add Collection",
      description: "Record new payments",
      icon: "add-circle",
      color: Colors.success.main,
      bg: Colors.success[50],
      onPress: () => router.push({
        pathname: "./AddCollection",
        params: preselectedCustomerCode ? { preselectedCustomerCode } : {}
      }),
      gradient: Gradients.success
    },
    {
      id: 2,
      title: "Upload Data",
      description: "Sync offline collections",
      icon: "cloud-upload",
      color: Colors.warning.main,
      bg: Colors.warning[50],
      onPress: () => router.push("./Upload"),
      gradient: Gradients.accent
    },
    {
      id: 3,
      title: "View History",
      description: "Browse past records",
      icon: "list",
      color: Colors.primary.main,
      bg: Colors.primary[50],
      onPress: () => router.push("./View-Collection"),
      gradient: Gradients.primary
    },
  ];

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header with Back Button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            if (preselectedCustomerCode) {
              router.back();
            } else {
              router.replace("/(tabs)/Home");
            }
          }} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Collection Dashboard</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Banner */}
          <View style={styles.bannerContainer}>
            <LinearGradient
              colors={Gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              <View style={styles.bannerContent}>
                <View style={styles.bannerIcon}>
                  <Ionicons name="wallet" size={32} color={Colors.primary.main} />
                </View>
                <View>
                  <Text style={styles.bannerTitle}>Payment Center</Text>
                  <Text style={styles.bannerSubtitle}>Manage collections & sync data</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Quick Actions Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <View style={styles.cardsContainer}>
              {sections.map((section, index) => (
                <View
                  key={section.id}
                >
                  <TouchableOpacity
                    style={styles.actionCard}
                    onPress={section.onPress}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: section.bg }]}>
                      <Ionicons name={section.icon} size={28} color={section.color} />
                    </View>

                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>{section.title}</Text>
                      <Text style={styles.cardDescription}>{section.description}</Text>
                    </View>

                    <View style={styles.arrowContainer}>
                      <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* Recent Activity Placeholder */}
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.text.secondary} />
              <Text style={styles.infoText}>
                Ensure you upload local collections when you have internet access to keep data synced.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
  },
  safeArea: {
    flex: 1,
    marginTop: 35,
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,

  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    color: Colors.text.primary,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  bannerContainer: {
    marginBottom: Spacing.xl,
  },
  banner: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadows.md,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  bannerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  bannerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: "700",
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  cardsContainer: {
    gap: Spacing.md,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: "700",
    color: Colors.text.primary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  arrowContainer: {
    padding: Spacing.xs,
  },
  recentSection: {
    marginBottom: 20,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  infoText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
  }
});