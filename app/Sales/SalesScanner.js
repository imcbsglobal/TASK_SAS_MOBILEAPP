// app/Sales/SalesScanner.js
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";

export default function SalesScanner() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [flash, setFlash] = useState("off");

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      Alert.alert(
        "Camera Permission Required",
        "Please enable camera access in settings to scan barcodes.",
        [
          { text: "Cancel", onPress: () => router.back() },
          { text: "OK", onPress: () => router.back() },
        ]
      );
    }
  }, [permission]);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);

    Vibration.vibrate(100);

    router.replace({
      pathname: "/Sales/SalesDetails",
      params: { ...params, scanned: String(data) },
    });
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#fff" }}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color={Colors.text.tertiary} style={{ marginBottom: Spacing.lg }} />
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionText}>App needs camera permission to scan barcodes</Text>

        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <LinearGradient colors={Gradients.primary} style={styles.gradientButton}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        flash={flash}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.topText}>Scan Barcode</Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              setFlash((prev) => (prev === "off" ? "on" : "off"))
            }
            style={styles.iconButton}
          >
            <Ionicons
              name={flash === "off" ? "flash-off" : "flash"}
              size={24}
              color={flash === 'on' ? Colors.warning.main : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {/* Scan Frame */}
        <View style={styles.scanAreaContainer}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <Text style={styles.scanHint}>Point camera at a barcode</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  permissionTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  permissionText: {
    color: Colors.text.secondary,
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xl,
    textAlign: "center",
  },
  permissionButton: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    width: '100%',
    ...Shadows.colored.primary,
  },
  gradientButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: Typography.sizes.base,
  },
  backButton: {
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    color: Colors.text.secondary,
    fontSize: Typography.sizes.base,
    fontWeight: '600',
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50, // improved status bar handling
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  titleContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BorderRadius.full,
  },
  topText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: Typography.sizes.base,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  scanAreaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#fff',
    borderWidth: 4,
  },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

  scanHint: {
    color: '#fff',
    marginTop: Spacing.xl,
    fontSize: Typography.sizes.base,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
});
