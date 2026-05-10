/**
 * SessionDetailScreen — full session view with transcript + reflections.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSessionDetail, useSessionReflections, useRegenerateReflection } from '../hooks/useSession';
import { TranscriptView } from '../components/TranscriptView';
import { ReflectionCard } from '../components/ReflectionCard';
import { StatusBadge, Button, Separator, colors } from '../components/UI';

export function SessionDetailScreen({ route }: any) {
  const { sessionId } = route.params;
  const [regenerating, setRegenerating] = useState(false);

  const { data: session, isLoading: sessionLoading } = useSessionDetail(sessionId);
  const { data: reflections, isLoading: reflectionsLoading } = useSessionReflections(sessionId);
  const regenerateMutation = useRegenerateReflection();

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Session not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Flatten all segments across chunks
  const allSegments = session.chunks
    .filter((c) => c.status === 'completed')
    .flatMap((c) => c.segments)
    .sort((a, b) => a.start_time - b.start_time);

  const completedChunks = session.chunks.filter((c) => c.status === 'completed').length;
  const totalChunks = session.chunks.length;

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateMutation.mutateAsync(sessionId);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{session.title || 'Untitled Session'}</Text>
          <View style={styles.metaRow}>
            <StatusBadge status={session.status} />
            <Text style={styles.metaText}>
              {formatDate(session.started_at)}
            </Text>
          </View>
          {session.total_duration_seconds && (
            <Text style={styles.duration}>
              Duration: {Math.round(session.total_duration_seconds / 60)} minutes
            </Text>
          )}
          <Text style={styles.chunks}>
            {completedChunks}/{totalChunks} chunks processed
          </Text>
        </View>

        <Separator />

        {/* Transcript */}
        <Text style={styles.sectionTitle}>Transcript</Text>
        <TranscriptView segments={allSegments} />

        <Separator />

        {/* Reflections */}
        <View style={styles.reflectionHeader}>
          <Text style={styles.sectionTitle}>AI Analysis</Text>
          {session.status === 'completed' && (
            <Button
              title="Regenerate"
              variant="ghost"
              loading={regenerating}
              onPress={handleRegenerate}
              style={styles.regenButton}
            />
          )}
        </View>

        {reflectionsLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
        ) : reflections && reflections.length > 0 ? (
          reflections.map((r) => (
            <ReflectionCard key={r.id} reflection={r} />
          ))
        ) : (
          <Text style={styles.noData}>
            {session.status === 'completed'
              ? 'Analysis will appear once chunks are processed'
              : 'Waiting for recording to complete...'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  duration: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
  },
  chunks: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  reflectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  regenButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  noData: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
  },
});