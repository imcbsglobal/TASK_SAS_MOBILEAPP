/**
 * Modern Theme System for TaskPrimeSAS
 * Features vibrant gradients, modern color palette, and comprehensive design tokens
 */

import { Platform } from 'react-native';

// Modern Color Palette
export const Colors = {
  // Primary Colors - Purple/Indigo
  primary: {
    50: '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    300: '#C4B5FD',
    400: '#A78BFA',
    500: '#8B5CF6',
    600: '#7C3AED',
    700: '#6D28D9',
    800: '#5B21B6',
    900: '#4C1D95',
    main: '#6366F1',
  },

  // Secondary - Teal
  secondary: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    200: '#99F6E4',
    300: '#5EEAD4',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0D9488',
    700: '#0F766E',
    800: '#115E59',
    900: '#134E4A',
    main: '#06B6D4',
  },

  // Accent - Coral/Orange
  accent: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',
    600: '#EA580C',
    700: '#C2410C',
    800: '#9A3412',
    900: '#7C2D12',
    main: '#F97316',
  },

  // Success - Emerald
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
    main: '#10B981',
  },

  // Warning - Amber
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    main: '#F59E0B',
  },

  // Error - Red
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    main: '#EF4444',
  },

  // Neutral/Gray
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Semantic Colors
  background: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB',
    gradient: ['#F5F3FF', '#FFFFFF'],
    dark: '#1E1B4B',
    darkGradient: ['#1E1B4B', '#312E81'],
  },

  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    link: '#6366F1',
  },

  border: {
    light: '#E5E7EB',
    medium: '#D1D5DB',
    dark: '#9CA3AF',
  },

  // Status Colors
  status: {
    online: '#10B981',
    offline: '#F59E0B',
    syncing: '#06B6D4',
    error: '#EF4444',
    info: '#06B6D4',
  },

  // Legacy support (for backward compatibility)
  light: {
    text: '#11181C',
    background: '#fff',
    tint: '#6366F1',
    icon: '#687076',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#6366F1',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#8B5CF6',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#8B5CF6',
  },
};

// Gradient Definitions
export const Gradients = {
  primary: ['#6366F1', '#8B5CF6'],
  secondary: ['#06B6D4', '#14B8A6'],
  accent: ['#F97316', '#FB923C'],
  success: ['#10B981', '#34D399'],
  background: ['#F5F3FF', '#FFFFFF'],
  darkBackground: ['#1E1B4B', '#312E81'],
  sunset: ['#F97316', '#FB923C', '#FBBF24'],
  ocean: ['#06B6D4', '#3B82F6', '#6366F1'],
  forest: ['#10B981', '#059669', '#047857'],
  warning: ['#F59E0B', '#FBBF24'],
  danger: ['#EF4444', '#F87171'],
  error: ['#EF4444', '#F87171'], // Alias for danger
  info: ['#06B6D4', '#3B82F6'],
  surface: ['#FFFFFF', '#F9FAFB'],
};

// Spacing Scale
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

// Border Radius
export const BorderRadius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  full: 9999,
};

// Shadows (iOS/Android compatible)
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  colored: {
    primary: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    secondary: {
      shadowColor: '#06B6D4',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
  },
};

// Typography Scale
export const Typography = {
  sizes: {
    xs: 12,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 36,
  },
  weights: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// Fonts
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// Component Styles
export const Components = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    ...Shadows.md,
  },
  button: {
    primary: {
      backgroundColor: Colors.primary.main,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
    secondary: {
      backgroundColor: Colors.secondary.main,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    fontSize: Typography.sizes.base,
  },
};

export default {
  Colors,
  Gradients,
  Spacing,
  BorderRadius,
  Shadows,
  Typography,
  Fonts,
  Components,
};
