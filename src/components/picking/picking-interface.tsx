"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PickableItemCard } from "./pickable-item-card";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";

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
  const markAsPicked = useMutation(api.orders.mutations.markOrderItemAsPicked);
  const markAsIssue = useMutation(api.orders.mutations.markOrderItemAsIssue);
  const markAsSkipped = useMutation(api.orders.mutations.markOrderItemAsSkipped);
  const markAsUnpicked = useMutation(api.orders.mutations.markOrderItemAsUnpicked);
  const markOrdersAsPicked = useMutation(api.orders.mutations.markOrdersAsPicked);
  const [isMarkingOrders, setIsMarkingOrders] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<
    Array<{ orderId: string; currentStatus: string }>
  >([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Keep all items - don't filter out picked items
  // Determine if item status using query data OR optimistic updates
  const allItems = pickableItems.map((item) => ({
    ...item,
    status: optimisticStatus.get(item.orderItemId) || item.status,
  }));

  // Count unpicked items for header
  const unpickedCount = allItems.filter((item) => item.status === "unpicked").length;

  // Group items by orderId
  const itemsByOrder = useMemo(() => {
    const grouped = new Map<string, PickableItem[]>();
    allItems.forEach((item) => {
      const existing = grouped.get(item.orderId) || [];
      grouped.set(item.orderId, [...existing, item]);
    });
    return grouped;
  }, [allItems]);

  // Determine ready orders (all items picked or issue, no skipped/unpicked)
  const readyOrders = useMemo(() => {
    const ready: string[] = [];
    itemsByOrder.forEach((items, orderId) => {
      const allReady = items.every((item) => item.status === "picked" || item.status === "issue");
      const hasUnpicked = items.some((item) => item.status === "unpicked");
      const hasSkipped = items.some((item) => item.status === "skipped");

      if (allReady && !hasUnpicked && !hasSkipped) {
        ready.push(orderId);
      }
    });
    return ready;
  }, [itemsByOrder]);

  // Count skipped items and orders
  const skippedStats = useMemo(() => {
    const skippedItems = allItems.filter((item) => item.status === "skipped");
    const ordersWithSkipped = new Set(skippedItems.map((item) => item.orderId));
    return {
      itemCount: skippedItems.length,
      orderCount: ordersWithSkipped.size,
    };
  }, [allItems]);

  // Count issue items and orders
  const issueStats = useMemo(() => {
    const issueItems = allItems.filter((item) => item.status === "issue");
    const ordersWithIssues = new Set(issueItems.map((item) => item.orderId));
    return {
      itemCount: issueItems.length,
      orderCount: ordersWithIssues.size,
    };
  }, [allItems]);

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

  const handleMarkOrders = async () => {
    if (readyOrders.length === 0) {
      return;
    }

    setMessage(null); // Clear any previous messages

    const attemptUpdate = async (forceUpdate = false) => {
      try {
        setIsMarkingOrders(true);
        const result = await markOrdersAsPicked({ orderIds: readyOrders, forceUpdate });

        if (result.updatedCount > 0) {
          // Show success message
          setMessage({
            type: "success",
            text: `Successfully marked ${result.updatedCount} order${result.updatedCount !== 1 ? "s" : ""} as packed.`,
          });
          // Clear message after 5 seconds
          setTimeout(() => setMessage(null), 5000);
          return true;
        } else {
          // Check if there are status mismatches that we can force update
          const statusMismatches = Object.entries(result.skipReasons || {}).filter(([_, reason]) =>
            reason.includes("Order status is"),
          );

          if (statusMismatches.length > 0 && !forceUpdate) {
            // Extract order details for the dialog
            const ordersToConfirm = statusMismatches.map(([orderId, reason]) => {
              const statusMatch = reason.match(/Order status is "([^"]+)"/);
              const currentStatus = statusMatch ? statusMatch[1] : "unknown";
              return { orderId, currentStatus };
            });

            setPendingOrders(ordersToConfirm);
            setShowConfirmDialog(true);
            return false; // Will be handled by dialog action
          } else {
            // Other errors - show error message
            const reasons = Object.entries(result.skipReasons || {})
              .map(([orderId, reason]) => `Order ${orderId}: ${reason}`)
              .join(", ");
            setMessage({
              type: "error",
              text: `No orders were updated. ${reasons || "Please check that orders have all items picked or marked as issue."}`,
            });
            return false;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to mark orders as picked:", error);
        setMessage({
          type: "error",
          text: `Failed to mark orders as picked: ${errorMessage}`,
        });
        return false;
      } finally {
        setIsMarkingOrders(false);
      }
    };

    await attemptUpdate();
  };

  // Handle confirmation from dialog
  const handleConfirmUpdate = async () => {
    setShowConfirmDialog(false);
    setIsMarkingOrders(true);
    setMessage(null);

    try {
      const result = await markOrdersAsPicked({ orderIds: readyOrders, forceUpdate: true });

      if (result.updatedCount > 0) {
        setMessage({
          type: "success",
          text: `Successfully marked ${result.updatedCount} order${result.updatedCount !== 1 ? "s" : ""} as packed.`,
        });
        setTimeout(() => setMessage(null), 5000);
      } else {
        const reasons = Object.entries(result.skipReasons || {})
          .map(([orderId, reason]) => `Order ${orderId}: ${reason}`)
          .join(", ");
        setMessage({
          type: "error",
          text: `No orders were updated. ${reasons || "Please check that orders have all items picked or marked as issue."}`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to mark orders as picked:", error);
      setMessage({
        type: "error",
        text: `Failed to mark orders as picked: ${errorMessage}`,
      });
    } finally {
      setIsMarkingOrders(false);
      setPendingOrders([]);
    }
  };

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

      {/* Footer with button and notifications */}
      <div className="max-w-2xl mx-auto px-4 pb-6">
        <div className="space-y-3">
          {/* Success/Error Message */}
          {message && (
            <div
              className={`rounded-lg px-4 py-2 border ${
                message.type === "success"
                  ? "bg-green-500/20 border-green-500/50 text-green-200"
                  : "bg-red-500/20 border-red-500/50 text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Notifications - side by side */}
          {(skippedStats.itemCount > 0 || issueStats.itemCount > 0) && (
            <div className="flex gap-3">
              {skippedStats.itemCount > 0 && (
                <div className="flex-1 bg-yellow-500/20 border border-yellow-500/50 rounded-lg px-4 py-2 text-yellow-200">
                  {skippedStats.itemCount} skipped item{skippedStats.itemCount !== 1 ? "s" : ""} in{" "}
                  {skippedStats.orderCount} order{skippedStats.orderCount !== 1 ? "s" : ""}
                </div>
              )}
              {issueStats.itemCount > 0 && (
                <div className="flex-1 bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-2 text-red-200">
                  {issueStats.itemCount} issue{issueStats.itemCount !== 1 ? "s" : ""} in{" "}
                  {issueStats.orderCount} order{issueStats.orderCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* Mark Orders Button */}
          <button
            onClick={handleMarkOrders}
            disabled={readyOrders.length === 0 || isMarkingOrders}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {isMarkingOrders ? "Marking Orders..." : `Mark (${readyOrders.length}) Orders Picked`}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order Status Update</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingOrders.length === 1 ? (
                <>
                  Order {pendingOrders[0].orderId} status is {pendingOrders[0].currentStatus}.
                  Expected it to be Paid. Still update it to Packed?
                </>
              ) : (
                <>
                  The following {pendingOrders.length} orders have a different status than
                  &quot;Paid&quot;:
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    {pendingOrders.map(({ orderId, currentStatus }) => (
                      <li key={orderId}>
                        Order {orderId}: Currently &quot;{currentStatus}&quot;
                      </li>
                    ))}
                  </ul>
                  Still update them to Packed?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUpdate}>Update Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
