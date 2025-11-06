"use client";

import { useState, useTransition } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Loader2, AlertCircle } from "lucide-react";

export function BrickOwlCredentialsForm() {
  const status = useQuery(api.marketplaces.shared.queries.getCredentialStatus, {
    provider: "brickowl",
  });

  const saveCredentials = useMutation(api.marketplaces.shared.mutations.saveCredentials);
  const revokeCredentials = useMutation(api.marketplaces.shared.mutations.revokeCredentials);
  const testConnection = useAction(api.marketplaces.shared.actions.testConnection);

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

  const configured = status?.configured ?? false;
  const isActive = status?.isActive ?? false;

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
