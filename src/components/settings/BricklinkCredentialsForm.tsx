"use client";

import { useState, useTransition, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { getEnv } from "@/lib/env";

export function BrickLinkCredentialsForm() {
  const status = useQuery(api.marketplaces.shared.credentials.getCredentialStatus, {
    provider: "bricklink",
  });

  const saveCredentials = useMutation(api.marketplaces.shared.credentials.saveCredentials);
  const revokeCredentials = useMutation(api.marketplaces.shared.credentials.revokeCredentials);
  const updateSyncSettings = useMutation(api.marketplaces.shared.credentials.updateSyncSettings);
  const testConnection = useAction(api.marketplaces.shared.actions.testConnection);
  const registerWebhookAction = useAction(
    api.marketplaces.bricklink.notifications.actions.registerWebhook,
  );
  const unregisterWebhookAction = useAction(
    api.marketplaces.bricklink.notifications.actions.unregisterWebhook,
  );

  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isSaving, startSaveTransition] = useTransition();
  const [isTesting, startTestTransition] = useTransition();
  const [isRevoking, startRevokeTransition] = useTransition();
  const [isUpdatingOrders, startOrdersTransition] = useTransition();
  const [isUpdatingInventory, startInventoryTransition] = useTransition();
  const [isRegisteringWebhook, startRegisterWebhookTransition] = useTransition();
  const [isUnregisteringWebhook, startUnregisterWebhookTransition] = useTransition();

  const configured = status?.configured ?? false;
  const isActive = status?.isActive ?? false;
  const ordersSyncEnabled = status?.ordersSyncEnabled ?? status?.syncEnabled ?? true;
  const inventorySyncEnabled = status?.inventorySyncEnabled ?? status?.syncEnabled ?? true;
  const webhookStatus = status?.webhookStatus ?? "unconfigured";
  const webhookEndpoint =
    status?.webhookEndpoint ??
    (status?.webhookStatus === "registered" ? webhookUrl ?? undefined : undefined) ??
    null;
  const webhookLastCheckedAt = status?.webhookLastCheckedAt;
  const webhookLastError = status?.webhookLastError;
  const webhookRegisteredAt = status?.webhookRegisteredAt;
  const isBusy = isSaving || isTesting || isRevoking;
  const webhookBusy = isRegisteringWebhook || isUnregisteringWebhook;

  // Construct webhook callback URL from query data (auto-updates when mutation completes)
  const webhookUrl = useMemo(() => {
    if (!configured || !status?.webhookToken) {
      return null;
    }

    const env = getEnv();
    // Convex HTTP routes are accessible via {deployment}.convex.site
    // Convert from .convex.cloud (WebSocket) to .convex.site (HTTP)
    const baseUrl = env.NEXT_PUBLIC_CONVEX_URL.replace(".convex.cloud", ".convex.site").replace(
      "/functions",
      "",
    );
    return `${baseUrl}/api/bricklink/webhook/${status.webhookToken}`;
  }, [configured, status?.webhookToken]);

  const [copied, setCopied] = useState(false);

  const handleCopyWebhookUrl = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSave = () => {
    setError(null);
    setSuccess(null);

    if (!consumerKey || !consumerSecret || !tokenValue || !tokenSecret) {
      setError("All fields are required for BrickLink credentials");
      return;
    }

    startSaveTransition(async () => {
      try {
        await saveCredentials({
          provider: "bricklink",
          bricklinkConsumerKey: consumerKey,
          bricklinkConsumerSecret: consumerSecret,
          bricklinkTokenValue: tokenValue,
          bricklinkTokenSecret: tokenSecret,
        });

        // Credentials saved - webhookToken generated and saved by mutation
        // Query will auto-refetch and show callback URL + status automatically
        setSuccess("Credentials saved successfully");

        // Clear form after save
        setConsumerKey("");
        setConsumerSecret("");
        setTokenValue("");
        setTokenSecret("");

        // Automatically test connection after save (status will update in Connection Status badge)
        try {
          await testConnection({ provider: "bricklink" });
          // Connection status will automatically update in the status badge via reactive query
        } catch (testErr) {
          // Test failure will be shown in Connection Status badge via query
          console.error("Connection test error:", testErr);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save credentials";
        setError(message);
      }
    });
  };

  const handleTest = () => {
    setError(null);
    setSuccess(null);

    if (!configured) {
      setError("Please save credentials before testing connection");
      return;
    }

    startTestTransition(async () => {
      try {
        await testConnection({ provider: "bricklink" });
        // Connection status will update in the Connection Status badge via query
        setSuccess("Connection test initiated. Check status above.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection test failed";
        setError(message);
      }
    });
  };

  const handleRevoke = () => {
    setError(null);
    setSuccess(null);

    if (
      !confirm("Are you sure you want to revoke these credentials? This action cannot be undone.")
    ) {
      return;
    }

    startRevokeTransition(async () => {
      try {
        await revokeCredentials({ provider: "bricklink" });
        setSuccess("Credentials revoked successfully");
        // Clear form
        setConsumerKey("");
        setConsumerSecret("");
        setTokenValue("");
        setTokenSecret("");
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
    startOrdersTransition(async () => {
      try {
        await updateSyncSettings({ provider: "bricklink", ordersSyncEnabled: next });
        setSuccess(`BrickLink order sync ${next ? "enabled" : "paused"}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update order sync setting";
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
    startInventoryTransition(async () => {
      try {
        await updateSyncSettings({ provider: "bricklink", inventorySyncEnabled: next });
        setSuccess(`BrickLink inventory sync ${next ? "enabled" : "paused"}.`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to update inventory sync setting";
        setError(message);
      }
    });
  };

  const handleRegisterWebhook = () => {
    if (!configured) {
      setError("Save credentials before registering the webhook.");
      return;
    }
    setError(null);
    setSuccess(null);
    startRegisterWebhookTransition(async () => {
      try {
        await registerWebhookAction({});
        setSuccess(
          "Webhook registration requested. BrickLink will now deliver order notifications.",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to register webhook";
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
        setSuccess("Webhook disabled. We'll continue polling for orders as a fallback.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to disable webhook";
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
        return <Badge className="gap-1.5 border-0 bg-gray-200 text-gray-700">Disabled</Badge>;
      default:
        return <Badge className="gap-1.5 border-0 bg-gray-200 text-gray-700">Not Configured</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Setup Instructions */}
      <div className="rounded-lg border-2 border-blue-300 bg-blue-100 dark:bg-blue-950 dark:border-blue-700 p-5 shadow-sm">
        <div className="mb-4">
          <h4 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <AlertCircle className="size-5 text-blue-600 dark:text-blue-400" />
            Setting Up BrickLink API Access
          </h4>
          <p className="text-sm text-foreground mb-4 font-medium">
            To connect your BrickLink store, you need to register your application and obtain OAuth
            credentials. Follow these steps:
          </p>
          <ol className="list-decimal list-inside space-y-3 text-sm text-foreground mb-4">
            <li className="font-medium">
              Go to your{" "}
              <a
                href="https://www.bricklink.com/v2/api/register_consumer.page"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                BrickLink API Settings
                <ExternalLink className="size-3.5" />
              </a>
            </li>
            <li className="font-medium">
              Add a new Access Token with:
              <ul className="list-disc list-inside ml-5 mt-2 space-y-2 font-normal">
                <li>
                  <strong className="font-semibold">IP Address:</strong>{" "}
                  <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                    0.0.0.0
                  </code>
                </li>
                <li>
                  <strong className="font-semibold">IP Mask:</strong>{" "}
                  <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                    0.0.0.0
                  </code>
                </li>
              </ul>
            </li>
            <li className="font-medium">
              Copy your Consumer Key, Consumer Secret, Token Value, and Token Secret
            </li>
            <li className="font-medium">Paste them into the form below and save</li>
            <li className="font-medium">
              Click <strong>Register Webhook</strong> below to configure the callback automatically.
              You can also copy the callback URL and add it manually in BrickLink if preferred.
            </li>
          </ol>
        </div>
        <div className="pt-3 border-t border-blue-300 dark:border-blue-800">
          <a
            href="https://www.bricklink.com/v2/api/register_consumer.page"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
          >
            <ExternalLink className="size-4" />
            Open BrickLink API Settings
          </a>
        </div>
      </div>

      {/* Connection Status - Always Visible */}
      <div className="rounded-md border bg-muted/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Connection Status</span>
          {status?.validationStatus === "testing" && (
            <Loader2 className="size-4 animate-spin text-yellow-600" />
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {configured ? (
            <>
              {isActive && status?.validationStatus === "success" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                  <Check className="size-3.5" />
                  Active & Connected
                </span>
              ) : isActive && status?.validationStatus === "failed" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700">
                  <X className="size-3.5" />
                  Active but Connection Failed
                </span>
              ) : isActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700">
                  <Loader2 className="size-3.5 animate-spin" />
                  Active - Testing Connection
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                  <X className="size-3.5" />
                  Inactive
                </span>
              )}
              {status?.lastValidatedAt && (
                <div className="text-xs text-muted-foreground">
                  Last tested: {new Date(status.lastValidatedAt).toLocaleString()}
                </div>
              )}
              {status?.validationMessage && (
                <div className="text-xs text-muted-foreground w-full">
                  {status.validationMessage}
                </div>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
              Not Configured
            </span>
          )}
        </div>
      </div>

      {/* Callback URL - Always Visible When Configured */}
      {configured && (
        <div className="space-y-4 rounded-md border bg-muted/50 p-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">Callback URL (Webhook)</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Copy this URL and paste it into your BrickLink API settings to receive order
              notifications automatically. This enables real-time order processing.
            </p>
          </div>

          {webhookUrl ? (
            <div className="space-y-2">
              <label htmlFor="webhook-url" className="text-xs font-medium text-foreground">
                Callback URL
              </label>
              <div className="flex gap-2">
                <Input
                  id="webhook-url"
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 size-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 size-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this URL in the &quot;Callback URL&quot; field in your{" "}
                <a
                  href="https://www.bricklink.com/v2/api/register_consumer.page"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  BrickLink API Settings
                  <ExternalLink className="size-3" />
                </a>
              </p>
            </div>
          ) : status === undefined ? (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs text-blue-800">Loading callback URL...</p>
            </div>
          ) : (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-xs text-yellow-800">
                Callback URL will appear here once credentials are saved. If you just saved, it
                should appear automatically.
              </p>
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
                Choose how BrickOps ingests orders and reserves inventory for BrickLink.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2">
              <div className="max-w-[75%] space-y-1">
                <p className="text-sm font-medium text-foreground">Order Sync</p>
                <p className="text-xs text-muted-foreground">
                  Automatically ingest new BrickLink orders using webhooks and polling.
                </p>
              </div>
              <Switch
                id="bricklink-orders-sync"
                checked={ordersSyncEnabled}
                onCheckedChange={(value) => handleToggleOrdersSync(value === true)}
                disabled={isBusy || isUpdatingOrders}
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2">
              <div className="max-w-[75%] space-y-1">
                <p className="text-sm font-medium text-foreground">Inventory Sync</p>
                <p className="text-xs text-muted-foreground">
                  Reserve BrickLink inventory quantities when orders arrive.
                </p>
              </div>
              <Switch
                id="bricklink-inventory-sync"
                checked={inventorySyncEnabled}
                onCheckedChange={(value) => handleToggleInventorySync(value === true)}
                disabled={isBusy || isUpdatingInventory}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border bg-muted/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Webhook Status</h4>
                <p className="text-xs text-muted-foreground">
                  Webhooks deliver orders instantly; polling continues as a fallback.
                </p>
              </div>
              {renderWebhookStatusBadge()}
            </div>
            {webhookRegisteredAt && (
              <div className="text-xs text-muted-foreground">
                Registered: {new Date(webhookRegisteredAt).toLocaleString()}
              </div>
            )}
            {webhookLastCheckedAt && (
              <div className="text-xs text-muted-foreground">
                Last verified: {new Date(webhookLastCheckedAt).toLocaleString()}
              </div>
            )}
            {(webhookEndpoint ?? webhookUrl) && (
              <div className="text-xs text-muted-foreground">
                Current endpoint:{" "}
                <span className="break-all font-medium text-foreground">
                  {webhookEndpoint ?? webhookUrl}
                </span>
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
                  "Register Webhook"
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
                  "Disable Webhook"
                )}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              We re-verify the webhook every few hours. If BrickLink revokes it, use “Register
              Webhook” to restore the integration.
            </p>
          </div>
        </div>
      )}

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="bricklink-consumer-key" className="text-sm font-medium">
            Consumer Key
          </label>
          <Input
            id="bricklink-consumer-key"
            type="text"
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder={configured ? "****" : "Enter consumer key"}
            disabled={isSaving || isTesting || isRevoking}
            autoComplete="off"
            data-lpignore="true"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="bricklink-consumer-secret" className="text-sm font-medium">
            Consumer Secret
          </label>
          <Input
            id="bricklink-consumer-secret"
            type="password"
            value={consumerSecret}
            onChange={(e) => setConsumerSecret(e.target.value)}
            placeholder={configured ? "****" : "Enter consumer secret"}
            disabled={isSaving || isTesting || isRevoking}
            autoComplete="off"
            data-lpignore="true"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="bricklink-token" className="text-sm font-medium">
            Token Value
          </label>
          <Input
            id="bricklink-token"
            type="text"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder={configured ? "****" : "Enter token value"}
            disabled={isSaving || isTesting || isRevoking}
            autoComplete="off"
            data-lpignore="true"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="bricklink-token-secret" className="text-sm font-medium">
            Token Secret
          </label>
          <Input
            id="bricklink-token-secret"
            type="password"
            value={tokenSecret}
            onChange={(e) => setTokenSecret(e.target.value)}
            placeholder={configured ? "****" : "Enter token secret"}
            disabled={isSaving || isTesting || isRevoking}
            autoComplete="off"
            data-lpignore="true"
          />
        </div>
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
