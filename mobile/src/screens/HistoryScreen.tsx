/**
 * HistoryScreen — list of past recording sessions.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSessionsList } from '../hooks/useSession';
import { Card, StatusBadge, EmptyState, Separator, colors } from '../components/UI';
import { SessionListItem } from '../types';

export function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { data, isLoading, refetch, isRefetching } = useSessionsList();

  const renderItem = useCallback(
    ({ item }: { item: SessionListItem }) => (
      <Card
        title={item.title || 'Untitled Session'}
        subtitle={formatDate(item.started_at)}
        onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
      >
        <View style={styles.cardMeta}>
          <StatusBadge status={item.status} />
          <Text style={styles.cardDuration}>
            {item.total_duration_seconds
              ? `${Math.round(item.total_duration_seconds / 60)} min`
              : `${item.chunk_count} chunks`}
          </Text>
        </View>
      </Card>
    ),
    [navigation],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      <FlatList
        data={data?.items || []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <EmptyState
              title="Loading..."
              message="Fetching your sessions"
            />
          ) : (
            <EmptyState
              title="No sessions yet"
              message="Start a recording to see your session history here"
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;

  return d.toLocaleDateString('en-US', {
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
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  list: {
    padding: 20,
    paddingTop: 0,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardDuration: {
    color: colors.textMuted,
    fontSize: 13,
  },
});