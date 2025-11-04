"use client";

import { AlertCircle } from "lucide-react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useGetPartColors } from "@/hooks/useGetPartColors";
import { bestTextOn, decodeHTML } from "@/lib/utils";
import type { PickableItem } from "./picking-interface";

interface PickableItemCardProps {
  item: PickableItem;
  isFocused: boolean;
  status: "picked" | "unpicked" | "skipped" | "issue";
  onPick: () => void;
  onSkip: () => void;
  onReportProblem: () => void;
  onUnpick: () => void;
  onFocus?: () => void; // Optional: called when card is clicked to focus
  orderColor: string;
  orderLetter: string;
}

// Get Tailwind color class for order color
function getOrderColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    pink: "bg-pink-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
    cyan: "bg-cyan-500",
    lime: "bg-lime-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    indigo: "bg-indigo-500",
    rose: "bg-rose-500",
    fuchsia: "bg-fuchsia-500",
    violet: "bg-violet-500",
    teal: "bg-teal-500",
  };
  return colorMap[color] || "bg-green-500";
}

// Helper to get image URL - uses imageUrl if available, otherwise constructs BrickLink URL
function getItemImageUrl(item: PickableItem): string | undefined {
  if (item.imageUrl) {
    return item.imageUrl;
  }
  if (item.itemNo && item.colorId) {
    return `https://img.bricklink.com/ItemImage/PN/${item.colorId}/${item.itemNo}.png`;
  }
  return undefined;
}

// Item Image Panel Component - matches the elegant design from examples
function ItemImagePanel({
  item,
  size = "large",
}: {
  item: PickableItem;
  size?: "large" | "compact";
}) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = getItemImageUrl(item);
  const imageSize = size === "large" ? "w-32 h-32" : "w-16 h-16";

  return (
    <div className={`relative ${imageSize} flex-shrink-0`}>
      {/* White card container */}
      <div className="w-full h-full bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        {/* Image container */}
        <div className={`w-full h-full p-2 flex items-center justify-center bg-white`}>
          {imageUrl && !imageError ? (
            <Image
              src={imageUrl}
              alt={item.itemName}
              width={size === "large" ? 120 : 60}
              height={size === "large" ? 120 : 60}
              className="object-contain"
              unoptimized
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="text-xs text-slate-400 text-center">No image</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PickableItemCard({
  item,
  isFocused,
  status,
  onPick,
  onSkip,
  onReportProblem,
  onUnpick,
  onFocus,
  orderColor,
  orderLetter,
}: PickableItemCardProps) {
  const orderColorClass = getOrderColorClass(orderColor);

  // Fetch color information for background color (must be called unconditionally)
  const { data: colors } = useGetPartColors(item.itemNo);
  const selectedColor = colors?.find((c) => c.colorId === item.colorId);
  const bgColor = selectedColor?.hexCode ? `#${selectedColor.hexCode}` : undefined;
  const textColorInfo = bgColor ? bestTextOn(bgColor) : undefined;
  const textColor = textColorInfo?.color;

  // Refs and state for dynamic font sizing of color name
  const colorNameRef = useRef<HTMLDivElement>(null);
  const [colorNameFontSize, setColorNameFontSize] = useState<number>(1.875); // Start with text-3xl (1.875rem)

  // Calculate font size to fit color name on one line without truncation
  useEffect(() => {
    if (isFocused && status === "unpicked" && colorNameRef.current) {
      const container = colorNameRef.current.parentElement;
      const colorName = selectedColor?.name || item.colorName;

      if (container && colorName) {
        const calculateFontSize = () => {
          requestAnimationFrame(() => {
            // Create a temporary element to measure text width at full size
            const temp = document.createElement("span");
            temp.style.visibility = "hidden";
            temp.style.position = "absolute";
            temp.style.whiteSpace = "nowrap";
            temp.style.fontSize = "1.875rem"; // text-3xl
            temp.style.fontWeight = "bold";
            temp.textContent = colorName;
            document.body.appendChild(temp);

            const textWidth = temp.offsetWidth;
            // Get available width: container width minus quantity width and gaps
            const quantityElement = container.querySelector("div.text-left");
            const quantityWidth = quantityElement
              ? (quantityElement as HTMLElement).offsetWidth
              : 60;
            const containerWidth = container.offsetWidth - quantityWidth - 32; // Account for gap and padding
            document.body.removeChild(temp);

            if (textWidth > containerWidth && containerWidth > 0) {
              // Scale down proportionally
              const scale = containerWidth / textWidth;
              setColorNameFontSize(Math.max(0.625, 1.875 * scale)); // Min 0.625rem (text-xs)
            } else {
              setColorNameFontSize(1.875); // Use full size
            }
          });
        };

        // Calculate immediately
        calculateFontSize();

        // Also recalculate on window resize
        window.addEventListener("resize", calculateFontSize);
        const observer = new ResizeObserver(calculateFontSize);
        if (container) {
          observer.observe(container);
        }

        return () => {
          window.removeEventListener("resize", calculateFontSize);
          observer.disconnect();
        };
      }
    } else {
      // Reset to default when not focused
      setColorNameFontSize(1.875);
    }
  }, [isFocused, status, selectedColor?.name, item.colorName]);

  const renderExpandedCard = () => (
    <div className="relative bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
      {/* Overlay for picked/skipped/issue status */}
      {status === "picked" && (
        <div className="absolute inset-0 bg-green-500/20 rounded-lg pointer-events-none z-0"></div>
      )}
      {status === "issue" && (
        <div className="absolute inset-0 bg-red-500/20 rounded-lg pointer-events-none z-0"></div>
      )}
      {status === "skipped" && (
        <div className="absolute inset-0 bg-yellow-500/20 rounded-lg pointer-events-none z-0"></div>
      )}
      {/* Top Section: Image and Item Details */}
      <div className="flex gap-4 mb-6 relative z-10">
        {/* Item Image Panel */}
        <ItemImagePanel item={item} size="large" />

        {/* Item Text Information - with order letter on the right */}
        <div className="flex-1 min-w-0 rounded-lg p-4 bg-slate-800 border border-slate-700 flex gap-4">
          {/* Left column: Part name, Used, Part number */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-white mb-2 line-clamp-2">
              {decodeHTML(item.itemName)}
            </h3>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className="font-semibold text-red-500">Used</span>
              <span>{item.itemNo}</span>
            </div>
          </div>
          {/* Right column: Order letter */}
          {item.inventoryItemId && (
            <div className="flex-shrink-0">
              <div
                className={`w-12 h-12 ${orderColorClass} rounded-lg flex items-center justify-center`}
              >
                <span className="text-white text-xl font-bold">{orderLetter}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LOCATION and PICK - responsive layout */}
      <div className="flex flex-wrap gap-4 mb-4 relative z-10">
        {/* LOCATION Field */}
        <div className="flex-[1] min-w-fit" data-location-field>
          <div className="block text-xs text-slate-400 mb-1">LOCATION</div>
          <div className="w-full p-3 border border-slate-300 rounded-lg bg-white h-[72px] flex items-center">
            <div className="text-2xl font-bold text-slate-700 whitespace-nowrap">
              {item.location || "UNKNOWN"}
            </div>
          </div>
        </div>

        {/* PICK Field - with color background and color name */}
        <div className="flex-[2] min-w-fit" data-pick-field>
          <div className="block text-xs text-slate-400 mb-1">PICK</div>
          <button
            onClick={onPick}
            disabled={!item.inventoryItemId || status !== "unpicked"}
            className="w-full p-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-[72px] flex items-center justify-between overflow-hidden"
            style={{
              backgroundColor: bgColor || "#ffffff",
              color: textColor || undefined,
            }}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="text-left flex-shrink-0">
                <div className="text-3xl font-bold" style={{ color: textColor || "#1e293b" }}>
                  {item.quantity}
                </div>
              </div>
              {/* Color name on the same row - font size shrinks to fit on one line */}
              {(selectedColor?.name || item.colorName) && (
                <div
                  ref={colorNameRef}
                  className="font-bold whitespace-nowrap text-right flex-1 min-w-0"
                  style={{
                    color: textColor || "#1e293b",
                    fontSize: `${colorNameFontSize}rem`,
                    lineHeight: "1.2",
                  }}
                >
                  {selectedColor?.name || item.colorName}
                </div>
              )}
            </div>
          </button>
          {/* Remaining text below PICK */}
          <div
            className={`text-xs mt-1 ${
              Math.max(0, item.remainingAfterPick) === 0
                ? "font-bold text-red-500"
                : "text-slate-400"
            }`}
          >
            Remaining: {Math.max(0, item.remainingAfterPick)}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {!item.inventoryItemId && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-400">
                No inventory match found. Cannot pick this item.
              </p>
              <p className="text-xs text-yellow-500 mt-1">
                Part: {item.itemNo}, Color: {item.colorId}, Location: {item.location || "UNKNOWN"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between relative z-10">
        {status === "unpicked" ? (
          <>
            <button
              onClick={onReportProblem}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Missing / Problem
            </button>
            <button
              onClick={onSkip}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Skip
            </button>
          </>
        ) : status === "picked" ? (
          <div className="flex justify-center w-full">
            <button
              onClick={onUnpick}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Unpick
            </button>
          </div>
        ) : status === "skipped" ? (
          <div className="flex justify-center w-full">
            <button
              onClick={onUnpick}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Unskip
            </button>
          </div>
        ) : status === "issue" ? (
          <div className="flex justify-center w-full">
            <button
              onClick={onUnpick}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Remove Issue
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderCollapsedCard = ({
    interactive,
    showPickedOverlay,
    showIssueOverlay,
    showSkippedOverlay,
    showInactiveOverlay,
  }: {
    interactive: boolean;
    showPickedOverlay: boolean;
    showIssueOverlay: boolean;
    showSkippedOverlay: boolean;
    showInactiveOverlay: boolean;
  }) => (
    <div
      onClick={interactive ? onFocus : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onFocus?.();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`relative p-4 bg-slate-800 border border-slate-700 rounded-lg transition-colors overflow-hidden ${
        interactive ? "cursor-pointer hover:bg-slate-700" : ""
      } ${!item.inventoryItemId ? "border-yellow-700/50" : ""} ${showPickedOverlay || showIssueOverlay || showSkippedOverlay ? "opacity-75" : ""}`}
    >
      {showPickedOverlay && (
        <div className="absolute inset-0 bg-green-500/20 rounded-lg pointer-events-none z-50"></div>
      )}
      {showIssueOverlay && (
        <div className="absolute inset-0 bg-red-500/20 rounded-lg pointer-events-none z-50"></div>
      )}
      {showSkippedOverlay && (
        <div className="absolute inset-0 bg-yellow-500/20 rounded-lg pointer-events-none z-50"></div>
      )}
      {showInactiveOverlay && (
        <div className="absolute inset-0 bg-black/20 rounded-lg pointer-events-none z-50"></div>
      )}
      <div className="flex items-center gap-3 relative z-10">
        {/* Item Image */}
        <ItemImagePanel item={item} size="compact" />

        {/* Item Details */}
        <div className="flex-1 min-w-0">
          {/* Item Name */}
          <div className="text-sm font-medium text-white truncate mb-1">
            {decodeHTML(item.itemName)}
          </div>

          {/* Used + Color + Item Number + Location + Quantity */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-red-500 font-medium">Used</span>
            {(selectedColor?.name || item.colorName) && (
              <span className="text-slate-300">{selectedColor?.name || item.colorName}</span>
            )}
            <span className="text-slate-300">{item.itemNo}</span>
            <span className="text-slate-300">{item.location || "UNKNOWN"}</span>
            <span className="text-slate-300">Qty: {item.quantity}</span>
          </div>

          {!item.inventoryItemId && (
            <div className="flex items-center gap-2 mt-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-xs text-yellow-500">No inventory match</span>
            </div>
          )}
        </div>

        {/* Availability Indicator */}
        {item.inventoryItemId && (
          <div
            className={`w-12 h-12 ${orderColorClass} rounded-lg flex items-center justify-center flex-shrink-0 relative z-20`}
          >
            <span className="text-white text-lg font-bold">{orderLetter}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (status === "picked" && !isFocused) {
    return renderCollapsedCard({
      interactive: true,
      showPickedOverlay: true,
      showIssueOverlay: false,
      showSkippedOverlay: false,
      showInactiveOverlay: false,
    });
  }

  if (status === "issue" && !isFocused) {
    return renderCollapsedCard({
      interactive: true,
      showPickedOverlay: false,
      showIssueOverlay: true,
      showSkippedOverlay: false,
      showInactiveOverlay: false,
    });
  }

  if (status === "skipped" && !isFocused) {
    return renderCollapsedCard({
      interactive: true,
      showPickedOverlay: false,
      showIssueOverlay: false,
      showSkippedOverlay: true,
      showInactiveOverlay: false,
    });
  }

  return (
    <div className="relative">
      <div
        className={`transition-all duration-300 ease-in-out ${
          isFocused
            ? "opacity-0 scale-95 absolute inset-0 pointer-events-none"
            : "opacity-100 scale-100 relative"
        }`}
      >
        {renderCollapsedCard({
          interactive: true,
          showPickedOverlay: false,
          showIssueOverlay: status === "issue",
          showSkippedOverlay: status === "skipped",
          showInactiveOverlay: !isFocused && status === "unpicked",
        })}
      </div>
      <div
        className={`transition-all duration-300 ease-in-out ${
          isFocused
            ? "opacity-100 scale-100 relative"
            : "opacity-0 scale-95 absolute inset-0 pointer-events-none"
        }`}
      >
        {renderExpandedCard()}
      </div>
    </div>
  );
}
