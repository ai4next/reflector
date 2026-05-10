/**
 * Reusable UI components for Reflector.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';

// ─── Colors ─────────────────────────────────────────────
export const colors = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceLight: '#1a1a1a',
  border: '#2a2a2a',
  primary: '#3b82f6',
  primaryDim: '#1d4ed8',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  text: '#fafafa',
  textDim: '#a0a0a0',
  textMuted: '#666',
} as const;

// ─── Button ─────────────────────────────────────────────
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const bgColor =
    variant === 'danger'
      ? colors.error
      : variant === 'ghost'
        ? 'transparent'
        : colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: bgColor,
          opacity: disabled ? 0.5 : 1,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: variant === 'ghost' ? colors.border : 'transparent',
        },
        style,
      ]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Card ───────────────────────────────────────────────
interface CardProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  onPress?: () => void;
}

export function Card({ title, subtitle, children, onPress }: CardProps) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      onPress={onPress}
      style={styles.card}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      {children}
    </Container>
  );
}

// ─── Status Badge ───────────────────────────────────────
interface BadgeProps {
  status: string;
}

export function StatusBadge({ status }: BadgeProps) {
  const colorMap: Record<string, string> = {
    completed: colors.success,
    processing: colors.warning,
    uploaded: colors.primary,
    recording: colors.primary,
    failed: colors.error,
  };

  return (
    <View style={[styles.badge, { backgroundColor: colorMap[status] || colors.textMuted + '40' }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

// ─── Empty State ────────────────────────────────────────
interface EmptyProps {
  icon?: string;
  title: string;
  message: string;
}

export function EmptyState({ title, message }: EmptyProps) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

// ─── Separator ──────────────────────────────────────────
export function Separator() {
  return <View style={styles.separator} />;
}

// ─── Section Header ─────────────────────────────────────
interface SectionHeaderProps {
  title: string;
}

export function SectionHeader({ title }: SectionHeaderProps) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ─── Styles ─────────────────────────────────────────────
const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyMessage: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  sectionHeader: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 24,
  },
});