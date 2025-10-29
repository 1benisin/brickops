"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { PartColor, ResourceStatus } from "@/types/catalog";

export type UseGetPartColorsResult = {
  data: PartColor[] | null | undefined;
  status: ResourceStatus | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

/**
 * Hook to fetch and auto-refresh part colors
 *
 * @example
 * const { data: colors, status, isLoading, refresh } = useGetPartColors("3001");
 */
export function useGetPartColors(partNumber: string | null): UseGetPartColorsResult {
  // Memoize args object to prevent unnecessary re-renders
  const args = useMemo(() => (partNumber ? { partNumber } : null), [partNumber]);

  const res = useQuery(api.catalog.queries.getPartColors, args ?? "skip");
  const refresh = useAction(api.catalog.actions.enqueueRefreshPartColors);

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
  const data = res?.data as PartColor[] | null | undefined;

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
      const key = `colors:${args.partNumber}`;
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
