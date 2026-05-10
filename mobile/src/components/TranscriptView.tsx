/**
 * TranscriptView — display transcribed segments with speaker labels.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Segment } from '../types';
import { colors } from './UI';

interface TranscriptViewProps {
  segments: Segment[];
  compact?: boolean;
}

const SPEAKER_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
];

function getSpeakerColor(label: string): string {
  const num = parseInt(label.replace('SPEAKER_', ''), 10) || 0;
  return SPEAKER_COLORS[num % SPEAKER_COLORS.length];
}

export function TranscriptView({ segments, compact = false }: TranscriptViewProps) {
  if (segments.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No transcript yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {segments.map((seg, i) => (
        <View key={seg.id || i} style={[styles.row, compact && styles.rowCompact]}>
          <View
            style={[
              styles.speakerDot,
              { backgroundColor: getSpeakerColor(seg.speaker_label) },
            ]}
          />
          <View style={styles.content}>
            <View style={styles.speakerRow}>
              <Text style={[styles.speakerLabel, { color: getSpeakerColor(seg.speaker_label) }]}>
                {seg.speaker_label.replace('SPEAKER_', 'S')}
              </Text>
              <Text style={styles.timestamp}>
                {formatTime(seg.start_time)}
              </Text>
            </View>
            <Text style={[styles.text, compact && styles.textCompact]}>
              {seg.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  rowCompact: {
    paddingVertical: 4,
  },
  speakerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  content: {
    flex: 1,
  },
  speakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  speakerLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  textCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});