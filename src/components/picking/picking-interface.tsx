"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PickableItemCard } from "./pickable-item-card";
import type { Id } from "@/convex/_generated/dataModel";

export type PickableItem = {
  orderItemId: Id<"bricklinkOrderItems">;
  orderId: string;
  itemNo: string;
  itemName: string;
  colorId: number;
  colorName?: string;
  quantity: number;
  location: string;
  status: "picked" | "unpicked" | "skipped" | "issue";
  inventoryItemId: Id<"inventoryItems"> | undefined;
  remainingAfterPick: number;
  imageUrl?: string;
};

interface PickingInterfaceProps {
  orderIds: string[];
  pickableItems: PickableItem[];
}

function smoothScrollToElement(element: HTMLElement, duration = 400) {
  const start = window.scrollY;
  const rect = element.getBoundingClientRect();
  const target = rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2;
  const distance = target - start;
  let startTime: number | null = null;

  function step(timestamp: number) {
    if (startTime === null) {
      startTime = timestamp;
    }
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    window.scrollTo({ top: start + distance * ease });

    if (elapsed < duration) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// Generate order color and letter mapping with random colors
function generateOrderMapping(orderIds: string[]) {
  const allColors = [
    "yellow",
    "red",
    "pink",
    "blue",
    "purple",
    "orange",
    "cyan",
    "lime",
    "amber",
    "emerald",
    "indigo",
    "rose",
    "fuchsia",
    "violet",
    "teal",
  ];

  const colors = sortColorsByContrast(allColors);

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const mapping = new Map<string, { color: string; letter: string }>();

  orderIds.forEach((orderId, index) => {
    const color = colors[index % colors.length];
    const letter = letters[index % letters.length];
    mapping.set(orderId, { color, letter });
  });

  return mapping;
}

const colorHexMap: Record<string, string> = {
  yellow: "#eab308",
  red: "#ef4444",
  pink: "#ec4899",
  blue: "#3b82f6",
  purple: "#a855f7",
  orange: "#f97316",
  cyan: "#06b6d4",
  lime: "#84cc16",
  amber: "#f59e0b",
  emerald: "#10b981",
  indigo: "#6366f1",
  rose: "#f43f5e",
  fuchsia: "#d946ef",
  violet: "#8b5cf6",
  teal: "#14b8a6",
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) {
    return null;
  }
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return [r, g, b];
}

function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sortColorsByContrast(colorNames: string[]): string[] {
  const colors = colorNames
    .map((name) => {
      const rgb = hexToRgb(colorHexMap[name]);
      return rgb ? { name, rgb } : null;
    })
    .filter((value): value is { name: string; rgb: RGB } => value !== null);

  if (colors.length === 0) {
    return colorNames;
  }

  const remaining = [...colors];
  const ordered: { name: string; rgb: RGB }[] = [];

  // Choose starting color with the largest sum distance to others
  let startIndex = 0;
  let maxDistanceSum = -Infinity;
  remaining.forEach((color, idx) => {
    const sum = remaining.reduce((acc, other) => acc + colorDistance(color.rgb, other.rgb), 0);
    if (sum > maxDistanceSum) {
      maxDistanceSum = sum;
      startIndex = idx;
    }
  });

  ordered.push(remaining[startIndex]);
  remaining.splice(startIndex, 1);

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((candidate, idx) => {
      const minDistance = ordered.reduce((min, existing) => {
        const dist = colorDistance(candidate.rgb, existing.rgb);
        return dist < min ? dist : min;
      }, Infinity);

      if (minDistance > bestScore) {
        bestScore = minDistance;
        bestIndex = idx;
      }
    });

    ordered.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  const orderedNames = ordered.map((entry) => entry.name);

  // Append any color names that didn't have hex definitions in original list order
  const fallbackNames = colorNames.filter((name) => !orderedNames.includes(name));

  return [...orderedNames, ...fallbackNames];
}

export function PickingInterface({ orderIds, pickableItems }: PickingInterfaceProps) {
  // Generate order mapping once (memoized to prevent recalculation)
  const orderMapping = useMemo(() => generateOrderMapping(orderIds), [orderIds]);
  const [optimisticStatus, setOptimisticStatus] = useState<
    Map<string, "picked" | "skipped" | "issue">
  >(new Map());
  const focusedItemRef = useRef<HTMLDivElement>(null);
  const markAsPicked = useMutation(api.marketplace.mutations.markOrderItemAsPicked);
  const markAsIssue = useMutation(api.marketplace.mutations.markOrderItemAsIssue);
  const markAsSkipped = useMutation(api.marketplace.mutations.markOrderItemAsSkipped);
  const markAsUnpicked = useMutation(api.marketplace.mutations.markOrderItemAsUnpicked);
  const updateOrderStatus = useMutation(api.marketplace.mutations.updateOrderStatusIfFullyPicked);

  // Keep all items - don't filter out picked items
  // Determine if item status using query data OR optimistic updates
  const allItems = pickableItems.map((item) => ({
    ...item,
    status: optimisticStatus.get(item.orderItemId) || item.status,
  }));

  // Count unpicked items for header
  const unpickedCount = allItems.filter((item) => item.status === "unpicked").length;

  // Find first unpicked item index for initial focus
  const firstUnpickedIndex = allItems.findIndex((item) => item.status === "unpicked");

  // Set initial focus to first unpicked item
  const [focusedIndex, setFocusedIndex] = useState<number>(
    firstUnpickedIndex >= 0 ? firstUnpickedIndex : 0,
  );

  // Reset focus if current focused item is out of bounds
  useEffect(() => {
    if (focusedIndex >= allItems.length && allItems.length > 0) {
      setFocusedIndex(0);
    }
  }, [allItems, focusedIndex]);

  // Get currently focused item
  const focusedItem = allItems[focusedIndex];

  // Auto-scroll to focused item
  useEffect(() => {
    if (focusedItemRef.current && focusedIndex !== null && focusedItem) {
      smoothScrollToElement(focusedItemRef.current);
    }
  }, [focusedIndex, focusedItem]);

  const handlePick = async (item: PickableItem) => {
    // Only allow picking unpicked items
    if (item.status !== "unpicked") {
      return;
    }

    if (!item.inventoryItemId) {
      // Show alert to user explaining why they can't pick
      alert(
        `Cannot pick this item: No matching inventory item found.\n\n` +
          `Part: ${item.itemNo}\n` +
          `Color: ${item.colorName || `Color ID ${item.colorId}`}\n` +
          `Location: ${item.location}\n\n` +
          `Please ensure the inventory item exists with matching part number, color, condition, and location.`,
      );
      return;
    }

    try {
      // Optimistic update for immediate UI feedback
      setOptimisticStatus((prev) => new Map(prev).set(item.orderItemId, "picked"));

      // Call mutation
      await markAsPicked({
        orderItemId: item.orderItemId,
        inventoryItemId: item.inventoryItemId,
      });

      // Check if order is fully picked and update status
      await updateOrderStatus({ orderId: item.orderId });

      // Move focus to next unpicked item
      // Need to recalculate allItems with updated optimisticStatus
      const updatedAllItems = pickableItems.map((it) => ({
        ...it,
        status:
          optimisticStatus.get(it.orderItemId) ||
          (it.orderItemId === item.orderItemId ? "picked" : it.status),
      }));
      const nextUnpicked = updatedAllItems.findIndex(
        (it, idx) => idx > focusedIndex && it.status === "unpicked",
      );
      if (nextUnpicked >= 0) {
        setFocusedIndex(nextUnpicked);
      } else {
        // Find any unpicked item before current
        const prevUnpicked = updatedAllItems.findIndex(
          (it, idx) => idx < focusedIndex && it.status === "unpicked",
        );
        if (prevUnpicked >= 0) {
          setFocusedIndex(prevUnpicked);
        }
      }
    } catch (error) {
      // Rollback optimistic update
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.delete(item.orderItemId);
        return next;
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to mark item as picked:", error);
      alert(`Failed to mark item as picked: ${errorMessage}`);
      // TODO: Show error toast
    }
  };

  const handleUnpick = async (item: PickableItem) => {
    // Save previous status for rollback
    const previousStatus = item.status;

    try {
      // Optimistic update for immediate UI feedback
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.delete(item.orderItemId); // Remove from optimistic status to revert to unpicked
        return next;
      });

      // Call mutation
      await markAsUnpicked({
        orderItemId: item.orderItemId,
        inventoryItemId: item.inventoryItemId,
      });

      // Focus stays on the same item (now unpicked)
    } catch (error) {
      // Rollback optimistic update - restore previous status
      if (previousStatus !== "unpicked") {
        setOptimisticStatus((prev) => new Map(prev).set(item.orderItemId, previousStatus));
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to mark item as unpicked:", error);
      alert(`Failed to mark item as unpicked: ${errorMessage}`);
    }
  };

  const handleSkip = async () => {
    const item = focusedItem;
    if (!item) return;

    // Only allow skipping unpicked items
    if (item.status !== "unpicked") {
      return;
    }

    try {
      // Optimistic update for immediate UI feedback
      setOptimisticStatus((prev) => new Map(prev).set(item.orderItemId, "skipped"));

      // Call mutation
      await markAsSkipped({
        orderItemId: item.orderItemId,
      });

      // Move focus to next unpicked item
      const updatedAllItems = pickableItems.map((it) => ({
        ...it,
        status:
          optimisticStatus.get(it.orderItemId) ||
          (it.orderItemId === item.orderItemId ? "skipped" : it.status),
      }));
      const nextUnpicked = updatedAllItems.findIndex(
        (it, idx) => idx > focusedIndex && it.status === "unpicked",
      );
      if (nextUnpicked >= 0) {
        setFocusedIndex(nextUnpicked);
      } else {
        // Find any unpicked item before current
        const prevUnpicked = updatedAllItems.findIndex(
          (it, idx) => idx < focusedIndex && it.status === "unpicked",
        );
        if (prevUnpicked >= 0) {
          setFocusedIndex(prevUnpicked);
        }
      }
    } catch (error) {
      // Rollback optimistic update
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.delete(item.orderItemId);
        return next;
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to mark item as skipped:", error);
      alert(`Failed to mark item as skipped: ${errorMessage}`);
    }
  };

  const handleReportProblem = async () => {
    const item = focusedItem;
    if (!item) return;

    // Only allow reporting problem on unpicked items
    if (item.status !== "unpicked") {
      return;
    }

    if (!item.inventoryItemId) {
      // Show alert to user explaining why they can't report issue
      alert(
        `Cannot report issue for this item: No matching inventory item found.\n\n` +
          `Part: ${item.itemNo}\n` +
          `Color: ${item.colorName || `Color ID ${item.colorId}`}\n` +
          `Location: ${item.location}\n\n` +
          `Please ensure the inventory item exists with matching part number, color, condition, and location.`,
      );
      return;
    }

    try {
      // Optimistic update for immediate UI feedback
      setOptimisticStatus((prev) => new Map(prev).set(item.orderItemId, "issue"));

      // Call mutation
      await markAsIssue({
        orderItemId: item.orderItemId,
        inventoryItemId: item.inventoryItemId,
      });

      // Move focus to next unpicked item
      const updatedAllItems = pickableItems.map((it) => ({
        ...it,
        status:
          optimisticStatus.get(it.orderItemId) ||
          (it.orderItemId === item.orderItemId ? "issue" : it.status),
      }));
      const nextUnpicked = updatedAllItems.findIndex(
        (it, idx) => idx > focusedIndex && it.status === "unpicked",
      );
      if (nextUnpicked >= 0) {
        setFocusedIndex(nextUnpicked);
      } else {
        // Find any unpicked item before current
        const prevUnpicked = updatedAllItems.findIndex(
          (it, idx) => idx < focusedIndex && it.status === "unpicked",
        );
        if (prevUnpicked >= 0) {
          setFocusedIndex(prevUnpicked);
        }
      }
    } catch (error) {
      // Rollback optimistic update
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.delete(item.orderItemId);
        return next;
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to mark item as issue:", error);
      alert(`Failed to mark item as issue: ${errorMessage}`);
    }
  };

  if (unpickedCount === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">All Items Picked!</h2>
          <p className="text-muted-foreground">
            All items for the selected orders have been picked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-[100] bg-slate-900 border-b border-slate-700 px-4 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Picking Orders</h1>
          <div className="text-sm text-slate-400">{unpickedCount} items remaining</div>
        </div>
      </div>

      {/* Items List */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {allItems.map((item, index) => (
          <div key={item.orderItemId} ref={index === focusedIndex ? focusedItemRef : null}>
            <PickableItemCard
              item={item}
              isFocused={index === focusedIndex}
              status={item.status}
              onPick={() => handlePick(item)}
              onSkip={handleSkip}
              onReportProblem={handleReportProblem}
              onUnpick={() => handleUnpick(item)}
              onFocus={() => setFocusedIndex(index)}
              orderColor={orderMapping.get(item.orderId)?.color || "green"}
              orderLetter={orderMapping.get(item.orderId)?.letter || "A"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
