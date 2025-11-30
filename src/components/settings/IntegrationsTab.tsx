import { BrickLinkCredentialsForm } from "@/components/settings/BricklinkCredentialsForm";
import { BrickOwlCredentialsForm } from "@/components/settings/BrickowlCredentialsForm";
import { Switch } from "@/components/ui/switch";

interface SyncSetting {
  provider: "bricklink" | "brickowl";
  syncEnabled: boolean;
  isActive: boolean;
}

interface IntegrationsTabProps {
  isOwner: boolean;
  syncSettings: SyncSetting[] | undefined;
  onSyncSettingsChange: (provider: "bricklink" | "brickowl", enabled: boolean) => void;
}

export function IntegrationsTab({
  isOwner,
  syncSettings,
  onSyncSettingsChange,
}: IntegrationsTabProps) {
  if (!isOwner) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Marketplace integrations are only available to workspace owners.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Auto-Sync Settings Section */}
      <section className="rounded-lg border bg-background p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Auto-Sync Settings</h2>
          <p className="text-sm text-muted-foreground">
            Control which marketplaces automatically sync inventory changes.
          </p>
        </div>
        <div className="mt-4 space-y-4">
          {syncSettings?.map((setting) => (
            <div key={setting.provider} className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Auto-sync to {setting.provider}</label>
                <p className="text-xs text-muted-foreground">
                  Automatically sync inventory changes to {setting.provider}
                </p>
              </div>
              <Switch
                checked={setting.syncEnabled}
                onCheckedChange={(enabled: boolean) =>
                  onSyncSettingsChange(setting.provider, enabled)
                }
                disabled={!setting.isActive}
              />
            </div>
          ))}
          {(!syncSettings || syncSettings.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Configure marketplace credentials below to enable sync settings.
            </p>
          )}
        </div>
      </section>

      {/* BrickLink Credentials Section */}
      <section className="space-y-4 rounded-lg border bg-background p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            BrickLink Credentials{" "}
            <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect your BrickLink store using OAuth 1.0a credentials. Only configure this if you
            sell on BrickLink.
          </p>
        </div>
        <BrickLinkCredentialsForm />
      </section>

      {/* BrickOwl Credentials Section */}
      <section className="space-y-4 rounded-lg border bg-background p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            BrickOwl Credentials{" "}
            <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect your BrickOwl store using your API key. Only configure this if you sell on
            BrickOwl.
          </p>
        </div>
        <BrickOwlCredentialsForm />
      </section>
    </>
  );
}
