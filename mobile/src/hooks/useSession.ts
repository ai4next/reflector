/**
 * useSession — TanStack Query hooks for session data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

// Query key factory
export const sessionKeys = {
  all: ['sessions'] as const,
  list: (filter?: string) => ['sessions', 'list', filter] as const,
  detail: (id: string) => ['sessions', 'detail', id] as const,
  reflections: (id: string) => ['sessions', 'reflections', id] as const,
};

/**
 * Fetch paginated session list.
 */
export function useSessionsList(status?: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: sessionKeys.list(status),
    queryFn: () => api.listSessions({ status, limit, offset }),
  });
}

/**
 * Fetch single session with all chunks and reflections.
 */
export function useSessionDetail(id: string | undefined) {
  return useQuery({
    queryKey: sessionKeys.detail(id!),
    queryFn: () => api.getSession(id!),
    enabled: !!id,
  });
}

/**
 * Fetch reflections for a session.
 */
export function useSessionReflections(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionKeys.reflections(sessionId!),
    queryFn: () => api.getReflections(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      // Auto-refresh if we don't have reflections yet
      const data = query.state.data;
      if (!data || data.length === 0) return 5000;
      return false;
    },
  });
}

/**
 * Create a new session.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => api.createSession(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

/**
 * Delete a session.
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

/**
 * Regenerate reflection for a session.
 */
export function useRegenerateReflection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.regenerateReflection(sessionId),
    onSuccess: (_data, sessionId) => {
      // Wait a bit then refetch reflections
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: sessionKeys.reflections(sessionId),
        });
      }, 2000);
    },
  });
}