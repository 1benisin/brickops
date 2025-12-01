"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Part, ResourceStatus } from "@/types/catalog";

export type UseGetPartResult = {
  data: Part | null | undefined;
  status: ResourceStatus | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

/**
 * Hook to fetch and auto-refresh part data
 *
 * @example
 * const { data: part, status, isLoading, refresh } = useGetPart("3001");
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (!part) return <div>Part not found</div>;
 * return <div>{part.name}</div>;
 */
export function useGetPart(partNumber: string | null): UseGetPartResult {
  // Memoize args object to prevent unnecessary re-renders
  const args = useMemo(() => (partNumber ? { partNumber } : null), [partNumber]);

  const res = useQuery(api.catalog.parts.getPart, args ?? "skip");
  const refresh = useAction(api.catalog.parts.enqueueRefreshPart);

  // Deduplication for auto-refresh
  const seen = useRef(new Set<string>());
  const oncePerKey = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    if (seen.current.has(key)) return;
    seen.current.add(key);
    try {
      await fn();
    } catch {
      // Allow retries after a failure
      seen.current.delete(key);
    }
  }, []);

  const isLoading = res === undefined;
  const status = res?.status as ResourceStatus | undefined;
  const data = res?.data as Part | null | undefined;

  // Determine if this resource needs a refresh
  // Only refresh if missing or stale (not if already refreshing or fresh)
  const needsRefresh = useMemo(() => {
    if (isLoading || !res) return false;
    const s = res.status;
    return s === "missing" || s === "stale";
  }, [isLoading, res]);

  // Auto-refresh once per key if needed
  useEffect(() => {
    if (!args) return; // Early exit for null args
    if (isLoading || !res) return;
    if (needsRefresh) {
      const key = `part:${args.partNumber}`;
      oncePerKey(key, () => refresh(args));
    }
  }, [args, isLoading, needsRefresh, oncePerKey, refresh, res]);

  // Early return if no args provided (after all hooks are called)
  if (!args) {
    return {
      data: null,
      status: undefined,
      isLoading: false,
      isRefreshing: false,
      refresh: async () => {},
    };
  }

  const isRefreshing = status === "refreshing" || (status === "stale" && needsRefresh);

  return {
    data,
    status,
    isLoading,
    isRefreshing,
    refresh: async () => {
      await refresh(args);
    },
  };
}
