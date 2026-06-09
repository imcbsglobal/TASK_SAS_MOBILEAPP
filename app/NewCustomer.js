// app/NewCustomer.js
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState, useCallback } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BorderRadius, Colors, Gradients, Spacing, Typography } from '../constants/theme';

const { width } = Dimensions.get('window');

const PINK_GRADIENT = ['#EC4899', '#BE185D'];
const PINK_LIGHT = '#FDF2F8';
const PINK_MAIN = '#EC4899';
const PINK_DARK = '#BE185D';

export default function NewCustomer() {
  const router = useRouter();

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Location state
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Photo state
  const [photo, setPhoto] = useState(null);
  // Guard: prevent opening camera/gallery while another pick is in progress
  const [isCapturing, setIsCapturing] = useState(false);

  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const locationPulse = useRef(new Animated.Value(1)).current;

  // ── Helpers ──────────────────────────────────────────────
  const animatePulse = (anim) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.95, duration: 120, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  // ── Location ─────────────────────────────────────────────
  const captureLocation = async () => {
    animatePulse(locationPulse);
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to capture location.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        address: geo
          ? [geo.name, geo.street, geo.city, geo.region, geo.postalCode]
              .filter(Boolean)
              .join(', ')
          : '',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to get location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  // ── Photo ─────────────────────────────────────────────────
  const capturePhoto = useCallback(async () => {
    if (isCapturing) return; // prevent double-tap
    setIsCapturing(true);
    animatePulse(pulseAnim);
    try {
      // Request permission first, separately from launch
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Camera permission is required. Please enable it in your device Settings.'
        );
        return;
      }
      // Use new mediaTypes array syntax (v17+), NO allowsEditing — avoids ucrop Activity crash on Android
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.75,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setPhoto(result.assets[0]);
      }
    } catch (e) {
      console.error('[NewCustomer] capturePhoto error:', e);
      Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const pickFromGallery = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Gallery permission is required. Please enable it in your device Settings.'
        );
        return;
      }
      // Use new mediaTypes array syntax (v17+), NO allowsEditing — avoids ucrop crash
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.75,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setPhoto(result.assets[0]);
      }
    } catch (e) {
      console.error('[NewCustomer] pickFromGallery error:', e);
      Alert.alert('Gallery Error', 'Failed to open gallery. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const handlePhotoOptions = () => {
    Alert.alert('Add Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: capturePhoto },
      { text: 'Choose from Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Submit (placeholder) ──────────────────────────────────
  const handleSubmit = () => {
    if (!customerName.trim()) {
      Alert.alert('Required', 'Please enter the customer name.');
      return;
    }
    if (!location) {
      Alert.alert('Required', 'Please capture the customer location.');
      return;
    }
    if (!photo) {
      Alert.alert('Required', 'Please capture or upload a photo.');
      return;
    }
    Alert.alert('Ready', 'Customer data captured! API integration coming soon.', [
      { text: 'OK' },
    ]);
  };

  const isFormReady = customerName.trim() && location && photo;

  // ── UI ───────────────────────────────────────────────────
  return (
    <LinearGradient colors={['#FDF2F8', '#FFFFFF', '#F5F3FF']} style={styles.bg}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDF2F8" />
      <SafeAreaView style={styles.safe}>
        {/* ── Header ── */}
        <LinearGradient colors={PINK_GRADIENT} style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="person-add" size={26} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>New Customer</Text>
            <Text style={styles.headerSub}>Register a new customer profile</Text>
          </View>
          <View style={styles.backBtn} />
        </LinearGradient>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {/* ── Customer Info Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <LinearGradient colors={PINK_GRADIENT} style={styles.cardHeaderIcon}>
                  <Ionicons name="person" size={18} color="#fff" />
                </LinearGradient>
                <Text style={styles.cardTitle}>Customer Details</Text>
              </View>

              {/* Name */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>
                  Customer Name <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={18} color={PINK_MAIN} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter customer name"
                    placeholderTextColor={Colors.text.tertiary}
                    value={customerName}
                    onChangeText={setCustomerName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Phone Number</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="call-outline" size={18} color={PINK_MAIN} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter phone number"
                    placeholderTextColor={Colors.text.tertiary}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Address */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Address</Text>
                <View style={[styles.inputRow, { alignItems: 'flex-start', paddingTop: 10 }]}>
                  <Ionicons name="home-outline" size={18} color={PINK_MAIN} style={[styles.inputIcon, { marginTop: 2 }]} />
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    placeholder="Enter address"
                    placeholderTextColor={Colors.text.tertiary}
                    value={address}
                    onChangeText={setAddress}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            </View>

            {/* ── Location Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <LinearGradient colors={['#3B82F6', '#6366F1']} style={styles.cardHeaderIcon}>
                  <Ionicons name="location" size={18} color="#fff" />
                </LinearGradient>
                <Text style={styles.cardTitle}>Location Capture</Text>
                {location && (
                  <View style={styles.capturedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={styles.capturedText}>Captured</Text>
                  </View>
                )}
              </View>

              {location ? (
                <View style={styles.locationResult}>
                  <LinearGradient
                    colors={['#EFF6FF', '#EDE9FE']}
                    style={styles.locationBox}
                  >
                    <View style={styles.locationRow}>
                      <Ionicons name="navigate" size={16} color="#3B82F6" />
                      <Text style={styles.locationCoords}>
                        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                      </Text>
                    </View>
                    {location.accuracy != null && (
                      <Text style={styles.locationAccuracy}>
                        Accuracy: ±{Math.round(location.accuracy)}m
                      </Text>
                    )}
                    {location.address ? (
                      <Text style={styles.locationAddress} numberOfLines={3}>
                        📍 {location.address}
                      </Text>
                    ) : null}
                  </LinearGradient>
                  <TouchableOpacity
                    style={styles.reCapturBtn}
                    onPress={captureLocation}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={16} color={PINK_MAIN} />
                    <Text style={styles.reCaptureBtnText}>Re-capture</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Animated.View style={{ transform: [{ scale: locationPulse }] }}>
                  <TouchableOpacity
                    style={styles.captureBtn}
                    onPress={captureLocation}
                    activeOpacity={0.85}
                    disabled={locationLoading}
                  >
                    <LinearGradient
                      colors={locationLoading ? ['#CBD5E1', '#94A3B8'] : ['#3B82F6', '#6366F1']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.captureBtnInner}
                    >
                      <Ionicons
                        name={locationLoading ? 'reload' : 'locate'}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.captureBtnText}>
                        {locationLoading ? 'Getting Location...' : 'Capture Current Location'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}

              <Text style={styles.fieldHint}>
                <Ionicons name="information-circle-outline" size={12} color={Colors.text.tertiary} />
                {' '}GPS location will be recorded for verification
              </Text>
            </View>

            {/* ── Photo Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <LinearGradient colors={['#F59E0B', '#EF4444']} style={styles.cardHeaderIcon}>
                  <Ionicons name="camera" size={18} color="#fff" />
                </LinearGradient>
                <Text style={styles.cardTitle}>Customer Photo</Text>
                {photo && (
                  <View style={styles.capturedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={styles.capturedText}>Added</Text>
                  </View>
                )}
              </View>

              {photo ? (
                <View style={styles.photoResult}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                  <View style={styles.photoActions}>
                    <TouchableOpacity
                      style={[styles.photoActionBtn, { borderColor: PINK_MAIN }]}
                      onPress={capturePhoto}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="camera-outline" size={16} color={PINK_MAIN} />
                      <Text style={[styles.photoActionText, { color: PINK_MAIN }]}>Retake</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.photoActionBtn, { borderColor: Colors.text.tertiary }]}
                      onPress={() => setPhoto(null)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.error.main} />
                      <Text style={[styles.photoActionText, { color: Colors.error.main }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.photoPlaceholderWrap}>
                  <TouchableOpacity
                    style={styles.photoPlaceholder}
                    onPress={handlePhotoOptions}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#FFF7ED', '#FEF3C7']}
                      style={styles.photoPlaceholderInner}
                    >
                      <View style={styles.photoIconCircle}>
                        <Ionicons name="camera-outline" size={36} color="#F59E0B" />
                      </View>
                      <Text style={styles.photoPlaceholderTitle}>Add Customer Photo</Text>
                      <Text style={styles.photoPlaceholderSub}>
                        Tap to take a photo or choose from gallery
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.photoOptionRow}>
                    <TouchableOpacity
                      style={styles.photoOptionBtn}
                      onPress={capturePhoto}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#F59E0B', '#EF4444']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.photoOptionBtnInner}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                        <Text style={styles.photoOptionBtnText}>Camera</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoOptionBtn}
                      onPress={pickFromGallery}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#8B5CF6', '#6366F1']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.photoOptionBtnInner}
                      >
                        <Ionicons name="images" size={16} color="#fff" />
                        <Text style={styles.photoOptionBtnText}>Gallery</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <Text style={styles.fieldHint}>
                <Ionicons name="information-circle-outline" size={12} color={Colors.text.tertiary} />
                {' '}Clear photo of customer or shop front preferred
              </Text>
            </View>

            {/* ── Progress Indicators ── */}
            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>Completion Status</Text>
              <View style={styles.progressRow}>
                <ProgressItem
                  label="Customer Name"
                  done={!!customerName.trim()}
                  icon="person-outline"
                />
                <ProgressItem
                  label="Location"
                  done={!!location}
                  icon="location-outline"
                />
                <ProgressItem
                  label="Photo"
                  done={!!photo}
                  icon="camera-outline"
                />
              </View>
            </View>

            {/* ── Submit Button ── */}
            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={isFormReady ? 0.85 : 1}
              style={{ marginTop: Spacing.md }}
            >
              <LinearGradient
                colors={isFormReady ? PINK_GRADIENT : ['#CBD5E1', '#94A3B8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                <Ionicons
                  name={isFormReady ? 'cloud-upload-outline' : 'lock-closed-outline'}
                  size={20}
                  color="#fff"
                />
                <Text style={styles.submitText}>
                  {isFormReady ? 'Register Customer' : 'Complete All Fields'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Small helper component ────────────────────────────────
function ProgressItem({ label, done, icon }) {
  return (
    <View style={progressStyles.item}>
      <View style={[progressStyles.iconWrap, { backgroundColor: done ? '#ECFDF5' : '#F3F4F6' }]}>
        <Ionicons name={icon} size={18} color={done ? '#10B981' : '#9CA3AF'} />
      </View>
      <Text style={[progressStyles.label, { color: done ? '#059669' : '#9CA3AF' }]}>{label}</Text>
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={done ? '#10B981' : '#D1D5DB'}
      />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
  },
});

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },

  // Header
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 16,
    paddingBottom: 28,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: Typography.sizes['2xl'],
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 3,
  },

  // Scroll
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    elevation: 4,
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.base,
    gap: 10,
  },
  cardHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
  },
  capturedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  capturedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },

  // Input
  fieldWrap: { marginBottom: Spacing.md },
  fieldLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  required: { color: '#EC4899', fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF2F8',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: '#FBCFE8',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    paddingVertical: 10,
    fontWeight: '500',
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 0,
  },
  fieldHint: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 8,
    lineHeight: 16,
  },

  // Location
  captureBtn: { borderRadius: BorderRadius.md, overflow: 'hidden', marginBottom: 8 },
  captureBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  captureBtnText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  locationResult: { marginBottom: 8 },
  locationBox: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: 8,
    gap: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationCoords: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#3B82F6',
  },
  locationAccuracy: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  locationAddress: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  reCapturBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#FBCFE8',
    borderRadius: BorderRadius.md,
    backgroundColor: '#FDF2F8',
  },
  reCaptureBtnText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: PINK_MAIN,
  },

  // Photo
  photoPlaceholderWrap: { marginBottom: 8 },
  photoPlaceholder: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FDE68A',
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  photoPlaceholderInner: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  photoIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  photoPlaceholderTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  photoPlaceholderSub: {
    fontSize: Typography.sizes.xs,
    color: '#B45309',
    textAlign: 'center',
  },
  photoOptionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoOptionBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  photoOptionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  photoOptionBtnText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: '#fff',
  },
  photoResult: { marginBottom: 8 },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.lg,
    marginBottom: 10,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    backgroundColor: '#fff',
  },
  photoActionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
  },

  // Progress
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  progressTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  progressRow: { gap: 0 },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: BorderRadius.xl,
    gap: 10,
    elevation: 8,
    shadowColor: PINK_MAIN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  submitText: {
    fontSize: Typography.sizes.md,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
