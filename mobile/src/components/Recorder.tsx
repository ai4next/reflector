/**
 * Recorder component — recording button + live transcription display.
 *
 * Shows:
 * - Recording button with REC indicator
 * - Model status (loading/downloading)
 * - Real-time transcription results from on-device STT (FunASR-Nano)
 * - Speaker-labeled segments as they're transcribed
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from './UI';
import type { ModelStatus, LocalSegment } from '../types';

interface RecorderProps {
  isRecording: boolean;
  error: string | null;
  modelStatus: ModelStatus;
  latestSegments: LocalSegment[];
  latestLanguage: string | null;
  isTranscribing: boolean;
  onStart: () => void;
  onStop: () => void;
}

const SPEAKER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

export function Recorder({
  isRecording,
  error,
  modelStatus,
  latestSegments,
  latestLanguage,
  isTranscribing,
  onStart,
  onStop,
}: RecorderProps) {
  const canRecord = modelStatus.type === 'ready';

  return (
    <View style={styles.container}>
      {/* Model status indicator */}
      {modelStatus.type === 'downloading' && (
        <View style={styles.modelStatus}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.modelStatusText}>
            Downloading model... {Math.round(modelStatus.progress * 100)}%
          </Text>
        </View>
      )}
      {modelStatus.type === 'error' && (
        <View style={styles.modelStatus}>
          <Text style={styles.modelErrorText}>
            Model error: {modelStatus.message}
          </Text>
        </View>
      )}

      {/* Recording button */}
      <TouchableOpacity
        onPress={isRecording ? onStop : onStart}
        style={[
          styles.button,
          isRecording && styles.buttonRecording,
          !canRecord && !isRecording && styles.buttonDisabled,
        ]}
        activeOpacity={0.7}
        disabled={!canRecord && !isRecording}
      >
        <View style={[styles.icon, isRecording && styles.iconRecording]}>
          {isRecording ? (
            <View style={styles.stopSquare} />
          ) : (
            <Text style={styles.micText}>🎙</Text>
          )}
        </View>
      </TouchableOpacity>

      <Text style={styles.label}>
        {isRecording
          ? 'Tap to stop recording'
          : !canRecord
          ? 'Download model to start'
          : 'Tap to start recording'}
      </Text>

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.statusRow}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>REC</Text>
          </View>
          {isTranscribing && (
            <View style={styles.transcribingBadge}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.transcribingText}>Transcribing...</Text>
            </View>
          )}
          {latestLanguage && (
            <Text style={styles.langText}>
              {latestLanguage === 'zh' ? '中文' : 'EN'}
            </Text>
          )}
        </View>
      )}

      {/* Live transcription preview */}
      {isRecording && latestSegments.length > 0 && (
        <View style={styles.transcriptPreview}>
          <Text style={styles.previewTitle}>Live transcription</Text>
          {latestSegments.slice(-3).map((seg, i) => (
            <View key={i} style={styles.previewSegment}>
              <View
                style={[
                  styles.speakerDot,
                  { backgroundColor: SPEAKER_COLORS[i % SPEAKER_COLORS.length] },
                ]}
              />
              <Text style={styles.previewText} numberOfLines={2}>
                {seg.text}
              </Text>
            </View>
          ))}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  modelStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelStatusText: {
    color: colors.textDim,
    fontSize: 13,
  },
  modelErrorText: {
    color: colors.error,
    fontSize: 13,
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
  buttonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  icon: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRecording: {},
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
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
  transcribingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  transcribingText: {
    color: colors.primary,
    fontSize: 12,
  },
  langText: {
    color: colors.textMuted,
    fontSize: 11,
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transcriptPreview: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  previewSegment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  speakerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  previewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
});