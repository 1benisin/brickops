"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { PriceGuide, ResourceStatus } from "@/types/catalog";

export type UseGetPriceGuideResult = {
  data: PriceGuide | null | undefined;
  status: ResourceStatus | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

/**
 * Hook to fetch and auto-refresh price guide data for a specific part and color
 *
 * @example
 * const { data: priceGuide, status, isLoading, refresh } = useGetPriceGuide("3001", 1);
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (!priceGuide) return <div>Price guide not found</div>;
 * return <div>New Stock: ${priceGuide.newStock?.avgPrice}</div>;
 */
export function useGetPriceGuide(
  partNumber: string | null,
  colorId: number | null,
): UseGetPriceGuideResult {
  // Memoize args object to prevent unnecessary re-renders
  const args = useMemo(
    () => (partNumber && colorId !== null ? { partNumber, colorId } : null),
    [partNumber, colorId],
  );

  const res = useQuery(api.catalog.queries.getPriceGuide, args ?? "skip");
  const refresh = useAction(api.catalog.actions.refreshPriceGuide);

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
  const data = res?.data as PriceGuide | null | undefined;

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
      const key = `priceGuide:${args.partNumber}:${args.colorId}`;
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
