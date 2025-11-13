import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SyncStatus, SyncStatusIndicatorProps } from "@/types/inventory";

const getStatusVariant = (
  status: SyncStatus,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "synced":
      return "default"; // Green-like default variant
    case "pending":
      return "secondary"; // Yellow-like secondary variant
    case "syncing":
      return "outline"; // Blue-like outline variant
    case "failed":
      return "destructive"; // Red destructive variant
    case "disabled":
      return "outline"; // Gray-like outline for disabled
    default:
      return "outline"; // Gray-like outline for unknown
  }
};

const getStatusIcon = (status: SyncStatus) => {
  switch (status) {
    case "synced":
      return "✓";
    case "pending":
      return "⏳";
    case "syncing":
      return "⟳";
    case "failed":
      return "✗";
    case "disabled":
      return "⊘";
    default:
      return "○";
  }
};

const getStatusText = (status: SyncStatus) => {
  switch (status) {
    case "synced":
      return "Synced";
    case "pending":
      return "Pending";
    case "syncing":
      return "Syncing";
    case "failed":
      return "Failed";
    case "disabled":
      return "Disabled";
    default:
      return "Unknown";
  }
};

export const SyncStatusIndicator = ({
  item,
  marketplace,
  syncEnabled = true,
}: SyncStatusIndicatorProps) => {
  if (!syncEnabled) return null; // Don't show status if sync disabled

  const marketplaceData =
    marketplace === "bricklink" ? item.marketplaceSync?.bricklink : item.marketplaceSync?.brickowl;

  const status = marketplaceData?.status;
  const error = marketplaceData?.error;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Badge variant={getStatusVariant(status)} className="cursor-help">
              <span className="mr-1">{getStatusIcon(status)}</span>
              {getStatusText(status)}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <div className="font-medium">{marketplace} Sync Status</div>
            <div className="capitalize">{status || "unknown"}</div>
            {error && <div className="text-red-600 mt-1">Error: {error}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
