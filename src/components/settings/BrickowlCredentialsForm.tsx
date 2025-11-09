"use client";

import { useState, useTransition, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, AlertCircle } from "lucide-react";

export function BrickOwlCredentialsForm() {
  const status = useQuery(api.marketplaces.shared.queries.getCredentialStatus, {
    provider: "brickowl",
  });

  const saveCredentials = useMutation(api.marketplaces.shared.mutations.saveCredentials);
  const revokeCredentials = useMutation(api.marketplaces.shared.mutations.revokeCredentials);
  const updateSyncSettings = useMutation(api.marketplaces.shared.mutations.updateSyncSettings);
  const testConnection = useAction(api.marketplaces.shared.actions.testConnection);
  const registerWebhookAction = useAction(api.marketplaces.brickowl.actions.registerWebhook);
  const unregisterWebhookAction = useAction(api.marketplaces.brickowl.actions.unregisterWebhook);

  const [apiKey, setApiKey] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [isSaving, startSaveTransition] = useTransition();
  const [isTesting, startTestTransition] = useTransition();
  const [isRevoking, startRevokeTransition] = useTransition();
  const [isUpdatingOrders, startUpdateOrdersTransition] = useTransition();
  const [isUpdatingInventory, startUpdateInventoryTransition] = useTransition();
  const [isRegisteringWebhook, startRegisterWebhookTransition] = useTransition();
  const [isUnregisteringWebhook, startUnregisterWebhookTransition] = useTransition();

  const configured = status?.configured ?? false;
  const isActive = status?.isActive ?? false;
  const ordersSyncEnabled = status?.ordersSyncEnabled ?? status?.syncEnabled ?? true;
  const inventorySyncEnabled = status?.inventorySyncEnabled ?? status?.syncEnabled ?? true;
  const webhookStatus = status?.webhookStatus ?? "unconfigured";
  const webhookEndpoint = status?.webhookEndpoint;
  const webhookLastCheckedAt = status?.webhookLastCheckedAt;
  const webhookLastError = status?.webhookLastError;
  const isBusy = isSaving || isTesting || isRevoking;
  const webhookBusy = isRegisteringWebhook || isUnregisteringWebhook;

  const [webhookTarget, setWebhookTarget] = useState(webhookEndpoint ?? "");

  useEffect(() => {
    setWebhookTarget(webhookEndpoint ?? "");
  }, [webhookEndpoint]);

  const handleSave = () => {
    setError(null);
    setSuccess(null);
    setTestResult(null);

    if (!apiKey) {
      setError("API key is required for BrickOwl credentials");
      return;
    }

    startSaveTransition(async () => {
      try {
        await saveCredentials({
          provider: "brickowl",
          brickowlApiKey: apiKey,
        });
        setSuccess("Credentials saved successfully");
        // Clear form after save
        setApiKey("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save credentials";
        setError(message);
      }
    });
  };

  const handleTest = () => {
    setError(null);
    setSuccess(null);
    setTestResult(null);

    if (!configured) {
      setError("Please save credentials before testing connection");
      return;
    }

    startTestTransition(async () => {
      try {
        const result = await testConnection({ provider: "brickowl" });
        setTestResult(result);
        if (result.success) {
          setSuccess("Connection test successful!");
        } else {
          setError(`Connection test failed: ${result.message}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection test failed";
        setError(message);
        setTestResult({ success: false, message });
      }
    });
  };

  const handleRevoke = () => {
    setError(null);
    setSuccess(null);
    setTestResult(null);

    if (
      !confirm("Are you sure you want to revoke these credentials? This action cannot be undone.")
    ) {
      return;
    }

    startRevokeTransition(async () => {
      try {
        await revokeCredentials({ provider: "brickowl" });
        setSuccess("Credentials revoked successfully");
        // Clear form
        setApiKey("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to revoke credentials";
        setError(message);
      }
    });
  };

  const handleToggleOrdersSync = (next: boolean) => {
    if (!configured) {
      return;
    }
    setError(null);
    setSuccess(null);
    startUpdateOrdersTransition(async () => {
      try {
        await updateSyncSettings({ provider: "brickowl", ordersSyncEnabled: next });
        setSuccess(`BrickOwl order sync ${next ? "enabled" : "paused"}.`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to update order sync setting";
        setError(message);
      }
    });
  };

  const handleToggleInventorySync = (next: boolean) => {
    if (!configured) {
      return;
    }
    setError(null);
    setSuccess(null);
    startUpdateInventoryTransition(async () => {
      try {
        await updateSyncSettings({ provider: "brickowl", inventorySyncEnabled: next });
        setSuccess(`BrickOwl inventory sync ${next ? "enabled" : "paused"}.`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to update inventory sync setting";
        setError(message);
      }
    });
  };

  const handleRegisterWebhook = () => {
    if (!configured) {
      setError("Save credentials before registering BrickOwl notifications.");
      return;
    }
    setError(null);
    setSuccess(null);
    const target = webhookTarget.trim();
    startRegisterWebhookTransition(async () => {
      try {
        await registerWebhookAction({ target: target.length > 0 ? target : undefined });
        setSuccess(
          target.length > 0
            ? `BrickOwl will send order notifications to ${target}.`
            : "Webhook registration requested using the default BrickOwl target.",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to register BrickOwl notifications";
        setError(message);
      }
    });
  };

  const handleUnregisterWebhook = () => {
    if (!configured) {
      return;
    }
    setError(null);
    setSuccess(null);
    startUnregisterWebhookTransition(async () => {
      try {
        await unregisterWebhookAction({});
        setSuccess("BrickOwl notifications disabled. Manual polling remains active.");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to disable BrickOwl notifications";
        setError(message);
      }
    });
  };

  const renderWebhookStatusBadge = () => {
    switch (webhookStatus) {
      case "registered":
        return (
          <Badge className="gap-1.5 border-0 bg-green-100 text-green-700">
            <Check className="size-3.5" />
            Registered
          </Badge>
        );
      case "registering":
        return (
          <Badge className="gap-1.5 border-0 bg-yellow-100 text-yellow-700">
            <Loader2 className="size-3.5 animate-spin" />
            Registering
          </Badge>
        );
      case "error":
        return (
          <Badge className="gap-1.5 border-0 bg-red-100 text-red-700">
            <X className="size-3.5" />
            Error
          </Badge>
        );
      case "disabled":
        return (
          <Badge className="gap-1.5 border-0 bg-gray-200 text-gray-700">
            Disabled
          </Badge>
        );
      default:
        return (
          <Badge className="gap-1.5 border-0 bg-gray-200 text-gray-700">
            Not Configured
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Badge */}
      {configured && (
        <div className="flex items-center gap-4 rounded-md border bg-muted/50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            {isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                <Check className="size-3" />
                Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                <X className="size-3" />
                Inactive
              </span>
            )}
          </div>
          {status?.lastValidatedAt && (
            <div className="text-sm text-muted-foreground">
              Last validated: {new Date(status.lastValidatedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {configured && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4 rounded-md border bg-muted/50 p-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Sync Controls</h4>
              <p className="text-xs text-muted-foreground">
                Choose how BrickOps imports orders and syncs inventory with BrickOwl.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Order Sync</p>
                <p className="text-xs text-muted-foreground">
                  Automatically ingest BrickOwl orders. Disabled orders will still be available via
                  manual sync.
                </p>
              </div>
              <Switch
                id="brickowl-orders-sync"
                checked={ordersSyncEnabled}
                onCheckedChange={(value) => handleToggleOrdersSync(value === true)}
                disabled={isBusy || isUpdatingOrders}
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Inventory Sync</p>
                <p className="text-xs text-muted-foreground">
                  Reserve BrickOwl inventory quantities when orders are received.
                </p>
              </div>
              <Switch
                id="brickowl-inventory-sync"
                checked={inventorySyncEnabled}
                onCheckedChange={(value) => handleToggleInventorySync(value === true)}
                disabled={isBusy || isUpdatingInventory}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border bg-muted/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Order Notifications</h4>
                <p className="text-xs text-muted-foreground">
                  BrickOwl notifies a static IP address when orders arrive. Configure a relay and we
                  will keep it in sync.
                </p>
              </div>
              {renderWebhookStatusBadge()}
            </div>
            <div className="space-y-2">
              <label htmlFor="brickowl-webhook-target" className="text-xs font-medium text-foreground">
                Notification Target (public IP or relay URL)
              </label>
              <Input
                id="brickowl-webhook-target"
                value={webhookTarget}
                onChange={(e) => setWebhookTarget(e.target.value)}
                placeholder="e.g. 203.0.113.12 or https://relay.example.com"
                disabled={isBusy || webhookBusy}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Leave blank to use the default <code>BRICKOWL_WEBHOOK_TARGET</code> environment
                variable. BrickOwl sends GET requests to <code>http://IP:42500/brick_owl_order_notify</code>.
              </p>
            </div>
            {webhookEndpoint && (
              <div className="text-xs text-muted-foreground">
                Current target:{" "}
                <span className="break-all font-medium text-foreground">{webhookEndpoint}</span>
              </div>
            )}
            {webhookLastCheckedAt && (
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(webhookLastCheckedAt).toLocaleString()}
              </div>
            )}
            {webhookLastError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                {webhookLastError}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRegisterWebhook}
                disabled={isBusy || webhookBusy}
              >
                {isRegisteringWebhook ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  "Register Notifications"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleUnregisterWebhook}
                disabled={isBusy || webhookBusy}
              >
                {isUnregisteringWebhook ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  "Disable Notifications"
                )}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              We continue polling BrickOwl every few minutes even when notifications are disabled,
              but push notifications deliver orders faster.
            </p>
          </div>
        </div>
      )}

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="brickowl-api-key" className="text-sm font-medium">
            API Key
          </label>
          <Input
            id="brickowl-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={configured ? "****" : "Enter your BrickOwl API key"}
            disabled={isSaving || isTesting || isRevoking}
            autoComplete="off"
            data-lpignore="true"
          />
        </div>
      </div>

      {/* Helper Text */}
      <div className="rounded-md bg-muted/50 p-4">
        <p className="text-xs text-muted-foreground">
          <AlertCircle className="mr-1 inline size-3" />
          This is your personal BrickOwl API key. You can obtain this from your BrickOwl account
          settings. All credentials are encrypted and stored securely.
        </p>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-500/50 bg-green-50 p-3">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {testResult && status?.validationStatus && (
        <div
          className={`rounded-md border p-3 ${
            status.validationStatus === "success"
              ? "border-green-500/50 bg-green-50"
              : status.validationStatus === "failed"
                ? "border-destructive/50 bg-destructive/10"
                : "border-yellow-500/50 bg-yellow-50"
          }`}
        >
          <div className="flex items-center gap-2">
            {status.validationStatus === "success" ? (
              <Check className="size-4 text-green-700" />
            ) : status.validationStatus === "failed" ? (
              <X className="size-4 text-destructive" />
            ) : (
              <Loader2 className="size-4 animate-spin text-yellow-700" />
            )}
            <p className="text-sm font-medium">
              {status.validationStatus === "success"
                ? "Connection Successful"
                : status.validationStatus === "failed"
                  ? "Connection Failed"
                  : "Testing..."}
            </p>
          </div>
          {status.validationMessage && (
            <p className="mt-1 text-xs text-muted-foreground">{status.validationMessage}</p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving || isTesting || isRevoking}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving...
            </>
          ) : configured ? (
            "Update Credentials"
          ) : (
            "Save Credentials"
          )}
        </Button>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!configured || isSaving || isTesting || isRevoking}
        >
          {isTesting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </Button>

        {configured && isActive && (
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={isSaving || isTesting || isRevoking}
          >
            {isRevoking ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Revoking...
              </>
            ) : (
              "Revoke"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
