/**
 * ReflectionCard — displays AI analysis results.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Reflection } from '../types';
import { Card, colors } from './UI';

interface ReflectionCardProps {
  reflection: Reflection;
}

export function ReflectionCard({ reflection }: ReflectionCardProps) {
  return (
    <Card>
      {/* Summary */}
      {reflection.summary && (
        <Text style={styles.summary}>{reflection.summary}</Text>
      )}

      {/* Key Themes */}
      {reflection.key_themes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Themes</Text>
          <View style={styles.tagRow}>
            {reflection.key_themes.map((theme, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{theme}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Action Items */}
      {reflection.action_items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Items</Text>
          {reflection.action_items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Improvement Suggestions */}
      {reflection.improvement_suggestions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggestions</Text>
          {reflection.improvement_suggestions.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>→</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Sentiment Overview */}
      {Object.keys(reflection.sentiment_overview).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sentiment</Text>
          <View style={styles.sentimentRow}>
            {Object.entries(reflection.sentiment_overview).map(([speaker, sentiment]) => (
              <View key={speaker} style={styles.sentimentItem}>
                <Text style={styles.sentimentSpeaker}>
                  {speaker.replace('SPEAKER_', 'S')}
                </Text>
                <Text
                  style={[
                    styles.sentimentValue,
                    {
                      color:
                        sentiment === 'positive'
                          ? colors.success
                          : sentiment === 'negative'
                            ? colors.error
                            : colors.warning,
                    },
                  ]}
                >
                  {sentiment}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Meta */}
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          via {reflection.provider_name}
          {reflection.tokens_used && ` · ${reflection.tokens_used} tokens`}
          {reflection.processing_time_ms && ` · ${(reflection.processing_time_ms / 1000).toFixed(1)}s`}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  listItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  bullet: {
    color: colors.primary,
    fontSize: 14,
    width: 14,
  },
  listText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  sentimentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sentimentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sentimentSpeaker: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sentimentValue: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  meta: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
  },
});