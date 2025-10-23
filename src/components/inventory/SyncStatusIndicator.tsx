import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | undefined;

export interface SyncStatusIndicatorProps {
  item: {
    bricklinkSyncStatus?: SyncStatus;
    brickowlSyncStatus?: SyncStatus;
    bricklinkSyncError?: string;
    brickowlSyncError?: string;
  };
  marketplace: "bricklink" | "brickowl";
  syncEnabled?: boolean;
}

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

  const status = marketplace === "bricklink" ? item.bricklinkSyncStatus : item.brickowlSyncStatus;
  const error = marketplace === "bricklink" ? item.bricklinkSyncError : item.brickowlSyncError;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={getStatusVariant(status)} className="cursor-help">
            <span className="mr-1">{getStatusIcon(status)}</span>
            {getStatusText(status)}
          </Badge>
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
