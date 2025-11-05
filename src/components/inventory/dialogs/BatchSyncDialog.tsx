"use client";
import { useState, useEffect, useTransition } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertCircle, Upload, MinusCircle } from "lucide-react";

export interface BatchSyncDialogProps {
  fileId: Id<"inventoryFiles"> | null;
  onOpenChange: (open: boolean) => void;
}

type SyncStatus = "idle" | "validating" | "syncing" | "completed" | "error";

interface SyncResult {
  marketplace: "bricklink" | "brickowl";
  success: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export function BatchSyncDialog({ fileId, onOpenChange }: BatchSyncDialogProps) {
  const [selectedMarketplaces, setSelectedMarketplaces] = useState({
    bricklink: false,
    brickowl: false,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Query file details and validation
  const file = useQuery(api.inventory.files.queries.getFile, fileId ? { fileId } : "skip");
  const validation = useQuery(
    api.inventory.files.queries.validateBatchSync,
    fileId ? { fileId } : "skip",
  );
  const syncSettings = useQuery(api.marketplace.queries.getSyncSettings);

  // Batch sync action
  const batchSyncFile = useAction(api.inventory.files.actions.batchSyncFile);

  // Reset state when dialog closes
  useEffect(() => {
    if (!fileId) {
      setSelectedMarketplaces({ bricklink: false, brickowl: false });
      setSyncStatus("idle");
      setSyncProgress(0);
      setStatusMessage("");
      setSyncResults([]);
      setValidationError(null);
    }
  }, [fileId]);

  // Validate before allowing sync
  useEffect(() => {
    if (!validation) return;

    if (!validation.isValid) {
      setValidationError(validation.errors.join(". "));
    } else {
      setValidationError(null);
    }
  }, [validation]);

  const canSync =
    !validationError &&
    (selectedMarketplaces.bricklink || selectedMarketplaces.brickowl) &&
    syncStatus === "idle";

  const handleMarketplaceToggle = (marketplace: "bricklink" | "brickowl") => {
    setSelectedMarketplaces((prev) => ({
      ...prev,
      [marketplace]: !prev[marketplace],
    }));
  };

  const handleSync = () => {
    if (!fileId || !canSync) return;

    startTransition(async () => {
      try {
        setSyncStatus("validating");
        setStatusMessage("Validating file and preparing items...");
        setSyncProgress(10);

        const marketplaces: Array<"bricklink" | "brickowl"> = [];
        if (selectedMarketplaces.bricklink) marketplaces.push("bricklink");
        if (selectedMarketplaces.brickowl) marketplaces.push("brickowl");

        setSyncStatus("syncing");
        setStatusMessage(`Synchronizing to ${marketplaces.join(" and ")}...`);
        setSyncProgress(30);

        // Execute batch sync
        const result = await batchSyncFile({
          fileId,
          marketplaces: marketplaces as Array<"bricklink" | "brickowl">,
        });

        setSyncProgress(100);
        setSyncStatus("completed");
        setStatusMessage("Synchronization completed");

        // Parse results
        const results: SyncResult[] = marketplaces.map((marketplace) => {
          const mpResult = result.results.find(
            (r: { marketplace: string }) => r.marketplace === marketplace,
          );
          return {
            marketplace,
            success: mpResult?.successful || 0,
            skipped: mpResult?.skipped || 0,
            failed: mpResult?.failed || 0,
            errors: mpResult?.errors || [],
          };
        });

        setSyncResults(results);
      } catch (error) {
        setSyncStatus("error");
        setStatusMessage(
          error instanceof Error ? error.message : "An error occurred during synchronization",
        );
        setSyncProgress(0);
      }
    });
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleClose = () => {
    // Don't allow closing during sync
    if (syncStatus === "validating" || syncStatus === "syncing") {
      return;
    }
    onOpenChange(false);
  };

  if (!fileId) return null;

  return (
    <>
      <Dialog open={!!fileId} onOpenChange={handleClose}>
        <DialogContent data-testid="batch-sync-dialog" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Batch Sync to Marketplace</DialogTitle>
            <DialogDescription>
              Synchronize all items in &quot;{file?.name || "this file"}&quot; to selected
              marketplaces.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Validation errors */}
            {validationError && (
              <div
                className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive"
                data-testid="validation-error"
              >
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <p className="text-sm">{validationError}</p>
              </div>
            )}

            {/* Marketplace selection */}
            {syncStatus === "idle" && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Select Marketplaces</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2" data-testid="marketplace-bricklink">
                    <Checkbox
                      id="bricklink"
                      checked={selectedMarketplaces.bricklink}
                      onCheckedChange={() => handleMarketplaceToggle("bricklink")}
                      disabled={syncStatus !== "idle"}
                    />
                    <label htmlFor="bricklink" className="text-sm cursor-pointer">
                      BrickLink
                    </label>
                    {syncSettings?.find((s) => s.provider === "bricklink")?.syncEnabled ===
                      false && (
                      <span className="text-xs text-muted-foreground">(Auto-sync disabled)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" data-testid="marketplace-brickowl">
                    <Checkbox
                      id="brickowl"
                      checked={selectedMarketplaces.brickowl}
                      onCheckedChange={() => handleMarketplaceToggle("brickowl")}
                      disabled={syncStatus !== "idle"}
                    />
                    <label htmlFor="brickowl" className="text-sm cursor-pointer">
                      BrickOwl
                    </label>
                    {syncSettings?.find((s) => s.provider === "brickowl")?.syncEnabled ===
                      false && (
                      <span className="text-xs text-muted-foreground">(Auto-sync disabled)</span>
                    )}
                  </div>
                </div>
                {!selectedMarketplaces.bricklink && !selectedMarketplaces.brickowl && (
                  <p className="text-sm text-muted-foreground">
                    Select at least one marketplace to continue
                  </p>
                )}
              </div>
            )}

            {/* Sync progress */}
            {(syncStatus === "validating" || syncStatus === "syncing") && (
              <div className="space-y-3" data-testid="sync-progress">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Progress</span>
                  <span className="text-sm text-muted-foreground">{syncProgress}%</span>
                </div>
                <Progress value={syncProgress} />
                <p className="text-sm text-muted-foreground">{statusMessage}</p>
              </div>
            )}

            {/* Sync results */}
            {syncStatus === "completed" && syncResults.length > 0 && (
              <div className="space-y-4" data-testid="sync-results">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium">Synchronization Complete</span>
                </div>

                {syncResults.map((result) => (
                  <div
                    key={result.marketplace}
                    className="p-4 rounded-md border bg-card space-y-2"
                    data-testid={`sync-result-${result.marketplace}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{result.marketplace}</span>
                      <div className="flex gap-2">
                        {result.success > 0 && (
                          <Badge variant="default" className="bg-green-600">
                            {result.success} synced
                          </Badge>
                        )}
                        {result.skipped > 0 && (
                          <Badge variant="secondary" className="bg-yellow-500 text-white">
                            {result.skipped} skipped
                          </Badge>
                        )}
                        {result.failed > 0 && (
                          <Badge variant="destructive">{result.failed} failed</Badge>
                        )}
                      </div>
                    </div>
                    {result.errors.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">Errors:</p>
                        <ul className="text-sm text-destructive space-y-1">
                          {result.errors.slice(0, 3).map((error, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <span>{error}</span>
                            </li>
                          ))}
                          {result.errors.length > 3 && (
                            <li className="text-muted-foreground">
                              ... and {result.errors.length - 3} more errors
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}

                {syncResults.some((r) => r.skipped > 0) && (
                  <Alert className="bg-yellow-50 text-yellow-800 border-yellow-200">
                    <MinusCircle className="stroke-yellow-800 h-4 w-4" />
                    <AlertTitle>
                      {
                        "Skipped items were already synced to the marketplace and were not synced again."
                      }
                    </AlertTitle>
                  </Alert>
                )}
              </div>
            )}

            {/* Error state */}
            {syncStatus === "error" && (
              <div
                className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive"
                data-testid="sync-error"
              >
                <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Synchronization Failed</p>
                  <p className="text-sm">{statusMessage}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {syncStatus === "idle" && (
              <>
                <Button variant="secondary" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  data-testid="start-sync-button"
                  onClick={handleSync}
                  disabled={!canSync || isSubmitting}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Starting..." : "Start Sync"}
                </Button>
              </>
            )}
            {(syncStatus === "completed" || syncStatus === "error") && (
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
