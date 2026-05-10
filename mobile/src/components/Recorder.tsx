/**
 * Recorder component — the main recording button + status display.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from './UI';

interface RecorderProps {
  isRecording: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function Recorder({ isRecording, error, onStart, onStop }: RecorderProps) {
  return (
    <View style={styles.container}>
      {/* Recording indicator */}
      <TouchableOpacity
        onPress={isRecording ? onStop : onStart}
        style={[styles.button, isRecording && styles.buttonRecording]}
        activeOpacity={0.7}
      >
        <View style={[styles.icon, isRecording && styles.iconRecording]}>
          {isRecording ? (
            <View style={styles.stopSquare} />
          ) : (
            <View style={styles.micIcon}>
              <Text style={styles.micText}>🎙</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <Text style={styles.label}>
        {isRecording ? 'Tap to stop recording' : 'Tap to start recording'}
      </Text>

      {isRecording && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>REC</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  button: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonRecording: {
    backgroundColor: colors.error,
  },
  icon: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRecording: {
    // Remove the background during recording
  },
  micIcon: {},
  micText: {
    fontSize: 28,
  },
  stopSquare: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  label: {
    color: colors.textDim,
    fontSize: 14,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  liveText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
});