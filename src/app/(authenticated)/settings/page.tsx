"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, RefreshCw, UserPlus } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import type {
  BricklinkPreviewResult,
  BrickowlPreviewResult,
  ImportSummary,
} from "@/convex/inventory/validators";
import { BrickLinkCredentialsForm } from "@/components/settings/BricklinkCredentialsForm";
import { BrickOwlCredentialsForm } from "@/components/settings/BrickowlCredentialsForm";
import { Switch } from "@/components/ui/switch";

type Role = "manager" | "picker" | "viewer";

interface MemberRow {
  _id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role: "owner" | Role;
  status: "active" | "invited";
  isCurrentUser: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authState = useQuery(api.users.queries.getAuthState);
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const members = useQuery(api.users.queries.listMembers);
  const updateProfile = useMutation(api.users.mutations.updateProfile);
  const regenerateInviteCode = useMutation(api.users.mutations.regenerateInviteCode);
  const updateUserRole = useMutation(api.users.mutations.updateUserRole);
  const removeUser = useMutation(api.users.mutations.removeUser);
  const createUserInvite = useMutation(api.users.mutations.createUserInvite);
  const updatePreferences = useMutation(api.users.mutations.updatePreferences);
  const updateSyncSettings = useMutation(api.marketplaces.shared.mutations.updateSyncSettings);
  const syncSettings = useQuery(api.marketplaces.shared.queries.getSyncSettings);
  const isDevEnvironment = useQuery(api.orders.mocks.isDevelopmentEnvironment);
  const deleteAllOrders = useMutation(api.orders.mocks.deleteAllOrders);
  const triggerMockWebhook = useMutation(api.marketplaces.bricklink.mockWebhooks.triggerMockWebhookNotification);
  const triggerMockBrickOwlOrder = useMutation(
    api.marketplaces.brickowl.mockOrders.triggerMockOrder,
  );
  const generateMockInventory = useMutation(api.inventory.testInventory.generateMockInventoryItems);
  const deleteAllInventory = useMutation(api.inventory.testInventory.deleteAllInventoryItems);
  const previewBricklinkInventoryAction = useAction(
    api.inventory.import.previewBricklinkInventory,
  );
  const importBricklinkInventoryAction = useAction(api.inventory.import.importBricklinkInventory);
  const previewBrickowlInventoryAction = useAction(
    api.inventory.import.previewBrickowlInventory,
  );
  const importBrickowlInventoryAction = useAction(api.inventory.import.importBrickowlInventory);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [isUpdatingProfile, startProfileTransition] = useTransition();
  const [isRegenerating, startInviteTransition] = useTransition();
  const [useSortLocations, setUseSortLocations] = useState(false);
  const [isUpdatingPreferences, startPreferencesTransition] = useTransition();

  // User management state
  const [isInviting, startUserInviteTransition] = useTransition();
  const [isUpdatingRoleId, setIsUpdatingRoleId] = useState<string | null>(null);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("manager");
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  // Development tools state
  const [isDeletingOrders, setIsDeletingOrders] = useState(false);
  const [isTriggeringMockWebhook, setIsTriggeringMockWebhook] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [devMessage, setDevMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [mockInventoryCount, setMockInventoryCount] = useState(30);
  const [mockWebhookQuantity, setMockWebhookQuantity] = useState(1);
  const [mockOrderMarketplace, setMockOrderMarketplace] = useState<"bricklink" | "brickowl">(
    "bricklink",
  );
  const [isGeneratingInventory, setIsGeneratingInventory] = useState(false);
  const [isDeletingInventory, setIsDeletingInventory] = useState(false);
  const [inventoryDeleteDialogOpen, setInventoryDeleteDialogOpen] = useState(false);
  const [bricklinkPreview, setBricklinkPreview] = useState<BricklinkPreviewResult | null>(null);
  const [bricklinkImportResult, setBricklinkImportResult] = useState<ImportSummary | null>(null);
  const [bricklinkPreviewError, setBricklinkPreviewError] = useState<string | null>(null);
  const [bricklinkImportError, setBricklinkImportError] = useState<string | null>(null);
  const [isPreviewingBricklink, setIsPreviewingBricklink] = useState(false);
  const [isImportingBricklink, setIsImportingBricklink] = useState(false);
  const [brickowlPreview, setBrickowlPreview] = useState<BrickowlPreviewResult | null>(null);
  const [brickowlImportResult, setBrickowlImportResult] = useState<ImportSummary | null>(null);
  const [brickowlPreviewError, setBrickowlPreviewError] = useState<string | null>(null);
  const [brickowlImportError, setBrickowlImportError] = useState<string | null>(null);
  const [isPreviewingBrickowl, setIsPreviewingBrickowl] = useState(false);
  const [isImportingBrickowl, setIsImportingBrickowl] = useState(false);

  const mockMarketplaceLabel = mockOrderMarketplace === "bricklink" ? "BrickLink" : "BrickOwl";

  // Tab state management with URL sync
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get("tab") || "profile";
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.push(`/settings?tab=${value}`, { scroll: false });
  };

  // Development tools handlers
  const handleTriggerMockOrder = async () => {
    setIsTriggeringMockWebhook(true);
    setDevMessage(null);
    try {
      const payload = { quantity: mockWebhookQuantity };
      const result =
        mockOrderMarketplace === "bricklink"
          ? await triggerMockWebhook(payload)
          : await triggerMockBrickOwlOrder(payload);
      setDevMessage({
        type: "success",
        text:
          result.message ||
          `Mock ${mockMarketplaceLabel} order processed successfully`,
      });
      setTimeout(() => setDevMessage(null), 5000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to trigger mock ${mockMarketplaceLabel} order`;
      setDevMessage({ type: "error", text: message });
    } finally {
      setIsTriggeringMockWebhook(false);
    }
  };

  const handleDeleteAllOrders = async () => {
    setIsDeletingOrders(true);
    setDevMessage(null);
    try {
      const result = await deleteAllOrders();
      setDeleteDialogOpen(false);
      setDevMessage({
        type: "success",
        text:
          result.message ||
          `Deleted ${result.ordersDeleted} orders and ${result.itemsDeleted} items`,
      });
      setTimeout(() => setDevMessage(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete orders";
      setDevMessage({ type: "error", text: message });
      setDeleteDialogOpen(false);
    } finally {
      setIsDeletingOrders(false);
    }
  };

  const handleGenerateMockInventory = async () => {
    setIsGeneratingInventory(true);
    setDevMessage(null);
    try {
      const result = await generateMockInventory({ count: mockInventoryCount });
      setDevMessage({
        type: "success",
        text: `Successfully created ${result.created} of ${result.requested} mock inventory items.${
          result.errors ? ` ${result.errors.length} errors occurred.` : ""
        }`,
      });
      setTimeout(() => setDevMessage(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate mock inventory";
      setDevMessage({ type: "error", text: message });
    } finally {
      setIsGeneratingInventory(false);
    }
  };

  const handleDeleteAllInventory = async () => {
    setIsDeletingInventory(true);
    setDevMessage(null);
    setInventoryDeleteDialogOpen(false);
    try {
      const result = await deleteAllInventory({});
      setDevMessage({
        type: "success",
        text: `Successfully deleted ${result.deletedItems} inventory items, ${result.deletedQuantityLedgerEntries} quantity ledger entries, and ${result.deletedLocationLedgerEntries} location ledger entries.`,
      });
      setTimeout(() => setDevMessage(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete inventory";
      setDevMessage({ type: "error", text: message });
    } finally {
      setIsDeletingInventory(false);
    }
  };

  const handlePreviewBricklinkInventory = async () => {
    setIsPreviewingBricklink(true);
    setBricklinkPreviewError(null);
    try {
      const result = await previewBricklinkInventoryAction({ limit: 20 });
      setBricklinkPreview(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to preview BrickLink inventory.";
      setBricklinkPreviewError(message);
    } finally {
      setIsPreviewingBricklink(false);
    }
  };

  const handleImportBricklinkInventory = async () => {
    setIsImportingBricklink(true);
    setBricklinkImportError(null);
    try {
      const result = await importBricklinkInventoryAction({});
      setBricklinkImportResult(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import BrickLink inventory.";
      setBricklinkImportError(message);
    } finally {
      setIsImportingBricklink(false);
    }
  };

  const handlePreviewBrickowlInventory = async () => {
    setIsPreviewingBrickowl(true);
    setBrickowlPreviewError(null);
    try {
      const result = await previewBrickowlInventoryAction({ limit: 20 });
      setBrickowlPreview(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to preview BrickOwl inventory.";
      setBrickowlPreviewError(message);
    } finally {
      setIsPreviewingBrickowl(false);
    }
  };

  const handleImportBrickowlInventory = async () => {
    setIsImportingBrickowl(true);
    setBrickowlImportError(null);
    try {
      const result = await importBrickowlInventoryAction({});
      setBrickowlImportResult(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import BrickOwl inventory.";
      setBrickowlImportError(message);
    } finally {
      setIsImportingBrickowl(false);
    }
  };

  useEffect(() => {
    if (currentUser?.user) {
      setFirstName(currentUser.user.firstName ?? "");
      setLastName(currentUser.user.lastName ?? "");
      setUseSortLocations(currentUser.user.useSortLocations ?? false);
    }
  }, [currentUser?.user]);

  useEffect(() => {
    if (!inviteOpen) {
      setInviteEmail("");
      setInviteRole("manager");
      setInviteResult(null);
      setUserError(null);
    }
  }, [inviteOpen]);

  const isOwner = currentUser?.user?.role === "owner";
  const inviteCode = currentUser?.businessAccount?.inviteCode ?? "";

  const handleProfileSubmit = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setProfileError("First and last name are required");
      return;
    }

    setProfileError(null);
    setProfileSuccess(null);

    startProfileTransition(async () => {
      try {
        await updateProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        setProfileSuccess("Profile updated");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update profile";
        setProfileError(message);
      }
    });
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setInviteFeedback("Invite code copied to clipboard");
      setTimeout(() => setInviteFeedback(null), 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to copy invite code";
      setInviteFeedback(message);
    }
  };

  const handleRegenerateInvite = () => {
    if (!isOwner) return;

    setInviteFeedback(null);
    startInviteTransition(async () => {
      try {
        const result = await regenerateInviteCode({});
        setInviteFeedback(`Invite code rotated: ${result.inviteCode}`);
        setTimeout(() => setInviteFeedback(null), 4000);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to regenerate invite code";
        setInviteFeedback(message);
      }
    });
  };

  const handleSortLocationsToggle = (checked: boolean) => {
    setUseSortLocations(checked);

    startPreferencesTransition(async () => {
      try {
        await updatePreferences({ useSortLocations: checked });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update preferences";
        console.error(message);
        setUseSortLocations(!checked);
      }
    });
  };

  const handleRoleChange = async (member: MemberRow, role: Role) => {
    if (!isOwner || member.isCurrentUser) return;
    try {
      setUserError(null);
      setIsUpdatingRoleId(member._id);
      await updateUserRole({ targetUserId: member._id as unknown as Id<"users">, role });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update role";
      setUserError(message);
    } finally {
      setIsUpdatingRoleId(null);
    }
  };

  const handleRemove = async (member: MemberRow) => {
    if (!isOwner || member.isCurrentUser) return;
    try {
      setUserError(null);
      setIsRemovingId(member._id);
      await removeUser({ targetUserId: member._id as unknown as Id<"users"> });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove user";
      setUserError(message);
    } finally {
      setIsRemovingId(null);
    }
  };

  const submitInvite = async () => {
    if (!inviteEmail.trim()) {
      setUserError("Email is required");
      return;
    }
    startUserInviteTransition(async () => {
      try {
        setUserError(null);
        const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/invite` : "";
        const result = await createUserInvite({
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          inviteBaseUrl: baseUrl,
          expiresInHours: 72,
        });
        setInviteResult(`Invite sent. Expires at ${new Date(result.expiresAt).toLocaleString()}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to send invite";
        setUserError(message);
      }
    });
  };

  const handleSyncSettingsChange = async (provider: "bricklink" | "brickowl", enabled: boolean) => {
    try {
      await updateSyncSettings({ provider, syncEnabled: enabled });
    } catch (err) {
      console.error("Failed to update sync settings:", err);
    }
  };

  const sortedMembers: MemberRow[] = useMemo(() => {
    if (!members || !Array.isArray(members)) return [];
    return [...members].sort((a, b) => {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;
      return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
    }) as MemberRow[];
  }, [members]);

  // Redirect unauthenticated or not-onboarded users
  if (
    authState &&
    (authState.isAuthenticated === false ||
      !authState.user ||
      authState.user.status !== "active" ||
      !authState.user.businessAccountId)
  ) {
    if (typeof window !== "undefined") {
      router.push("/signup");
    }
    return null;
  }

  if (currentUser === undefined || members === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-48 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, team, preferences, and integrations.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className={`grid w-full ${isDevEnvironment ? "grid-cols-5" : "grid-cols-4"}`}>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {isDevEnvironment && <TabsTrigger value="development">Development</TabsTrigger>}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid gap-6 rounded-lg border bg-background p-6 shadow-sm md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>
                <p className="text-sm text-muted-foreground">
                  This information is shared with your team to help identify activity in audit logs.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="firstName" className="text-sm font-medium text-foreground">
                    First name
                  </label>
                  <Input
                    id="firstName"
                    autoComplete="off"
                    data-lpignore="true"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={isUpdatingProfile}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm font-medium text-foreground">
                    Last name
                  </label>
                  <Input
                    id="lastName"
                    autoComplete="off"
                    data-lpignore="true"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    disabled={isUpdatingProfile}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <Input
                    id="email"
                    autoComplete="off"
                    data-lpignore="true"
                    value={currentUser.user?.email ?? ""}
                    disabled
                    readOnly
                  />
                </div>
              </div>

              {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
              {profileSuccess ? <p className="text-sm text-green-600">{profileSuccess}</p> : null}

              <Button type="button" onClick={handleProfileSubmit} disabled={isUpdatingProfile}>
                {isUpdatingProfile ? "Saving…" : "Save profile"}
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Role & Permissions</h2>
                <p className="text-sm text-muted-foreground">
                  Your current access level in this workspace.
                </p>
              </div>
              <div className="rounded-md border bg-card p-4" data-testid="role-permissions">
                <p className="text-sm">
                  <span className="font-medium text-foreground">Role:</span>{" "}
                  <span className="capitalize text-muted-foreground">
                    {currentUser.user?.role ?? "—"}
                  </span>
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {currentUser.user?.role === "owner" ? (
                    <>
                      <li>
                        Full access to all features including user management and account settings
                      </li>
                      <li>Can invite, remove, and change roles of users</li>
                      <li>Can rotate the business invite code</li>
                    </>
                  ) : null}
                  {currentUser.user?.role === "manager" ? (
                    <>
                      <li>Full inventory and order management</li>
                      <li>Cannot manage users or account settings</li>
                    </>
                  ) : null}
                  {currentUser.user?.role === "picker" ? (
                    <>
                      <li>Access to picking workflows and inventory adjustments</li>
                      <li>Read-only elsewhere</li>
                    </>
                  ) : null}
                  {currentUser.user?.role === "viewer" ? (
                    <>
                      <li>Read-only access to inventory and orders</li>
                      <li>Cannot make changes</li>
                    </>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-6">
          {/* Team Invite Code Section */}
          <section className="rounded-lg border bg-background p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Team Invite Code</h2>
              <p className="text-sm text-muted-foreground">
                Share this invite code during sign-up so teammates join the same business account.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={inviteCode} readOnly disabled className="sm:max-w-xs" />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyInvite}
                  disabled={!inviteCode}
                >
                  <Copy className="mr-2 size-4" /> Copy
                </Button>
                {isOwner && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleRegenerateInvite}
                    disabled={!isOwner || isRegenerating}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    {isRegenerating ? "Rotating…" : "Rotate"}
                  </Button>
                )}
              </div>
            </div>
            {inviteFeedback ? (
              <p className="mt-2 text-sm text-muted-foreground">{inviteFeedback}</p>
            ) : null}
            {!isOwner ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Invite code rotation is limited to business owners.
              </p>
            ) : null}
          </section>

          {/* Team Members Section */}
          <section className="space-y-4 rounded-lg border bg-background p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
                <p className="text-sm text-muted-foreground">
                  Everyone listed here shares access to inventory, orders, and catalog data for{" "}
                  <span className="font-medium text-foreground">
                    {currentUser.businessAccount?.name ?? "your business"}
                  </span>
                  .
                </p>
              </div>
              {isOwner && (
                <Button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  data-testid="invite-button"
                >
                  <UserPlus className="mr-2 size-4" />
                  Invite user
                </Button>
              )}
            </div>

            {userError && (
              <p className="text-sm text-destructive" role="alert">
                {userError}
              </p>
            )}

            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="grid grid-cols-5 gap-4 bg-muted/50 p-3 text-sm font-medium text-muted-foreground">
                <span>Name</span>
                <span>Role</span>
                <span>Status</span>
                <span>Email</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y">
                {sortedMembers.map((member) => (
                  <div key={member._id} className="grid grid-cols-5 items-center gap-4 p-3 text-sm">
                    <span className="font-medium text-foreground">
                      {member.name ??
                        (`${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "—")}
                      {member.isCurrentUser ? " (you)" : ""}
                    </span>
                    <span className="capitalize text-muted-foreground">
                      {isOwner && !member.isCurrentUser ? (
                        <select
                          aria-label={`role-select-${member._id}`}
                          className="rounded border bg-background px-2 py-1"
                          value={member.role}
                          onChange={(e) => handleRoleChange(member, e.target.value as Role)}
                          disabled={isUpdatingRoleId === member._id}
                          data-testid={`role-select-${member._id}`}
                        >
                          <option value="manager">manager</option>
                          <option value="picker">picker</option>
                          <option value="viewer">viewer</option>
                        </select>
                      ) : (
                        member.role
                      )}
                    </span>
                    <span className="capitalize text-muted-foreground">{member.status}</span>
                    <span className="text-muted-foreground">{member.email ?? "—"}</span>
                    <span className="flex justify-end">
                      {isOwner && !member.isCurrentUser ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const displayName =
                              member.name ??
                              (`${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
                                member.email ||
                                "this user");
                            if (window.confirm(`Are you sure you want to remove ${displayName}?`)) {
                              handleRemove(member);
                            }
                          }}
                          disabled={isRemovingId === member._id}
                          data-testid={`remove-${member._id}`}
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <section className="rounded-lg border bg-background p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Catalog Preferences</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Customize how you search and view your catalog
              </p>
            </div>

            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex-1">
                  <label
                    htmlFor="use-sort-locations"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Enable Sort Locations
                  </label>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Show location-based search in the catalog. When enabled, you can search parts by
                    their physical storage location.
                  </p>
                </div>
                <Switch
                  id="use-sort-locations"
                  checked={useSortLocations}
                  onCheckedChange={handleSortLocationsToggle}
                  disabled={isUpdatingPreferences}
                  className="ml-4"
                />
              </div>
            </div>
          </section>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          {isOwner ? (
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
                        <label className="text-sm font-medium">
                          Auto-sync to {setting.provider}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Automatically sync inventory changes to {setting.provider}
                        </p>
                      </div>
                      <Switch
                        checked={setting.syncEnabled}
                        onCheckedChange={(enabled: boolean) =>
                          handleSyncSettingsChange(setting.provider, enabled)
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
                    Connect your BrickLink store using OAuth 1.0a credentials. Only configure this
                    if you sell on BrickLink.
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
                    Connect your BrickOwl store using your API key. Only configure this if you sell
                    on BrickOwl.
                  </p>
                </div>
                <BrickOwlCredentialsForm />
              </section>
            </>
          ) : (
            <div className="rounded-lg border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                Marketplace integrations are only available to workspace owners.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Development Tab */}
        {isDevEnvironment && (
          <TabsContent value="development" className="space-y-6">
            <section className="rounded-lg border bg-background p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Development Tools</h2>
                <p className="text-sm text-muted-foreground">
                  Tools for testing and development. Only available in development environments.
                </p>
              </div>

              <div className="mt-6 space-y-4">
                {/* Marketplace Inventory Import */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Marketplace Inventory Import</h3>
                  <p className="text-xs text-muted-foreground">
                    Preview how many lots exist on each marketplace, then import any missing lots into
                    BrickOps before enabling automatic sync.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-foreground">BrickLink</h4>
                        <p className="text-xs text-muted-foreground">
                          Import active BrickLink store inventory as new BrickOps items.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePreviewBricklinkInventory}
                          disabled={isPreviewingBricklink}
                        >
                          {isPreviewingBricklink ? "Previewing..." : "Preview"}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleImportBricklinkInventory}
                          disabled={isImportingBricklink}
                        >
                          {isImportingBricklink ? "Importing..." : "Import All Lots"}
                        </Button>
                      </div>
                      {bricklinkPreviewError ? (
                        <p className="text-xs text-destructive">{bricklinkPreviewError}</p>
                      ) : null}
                      {bricklinkPreview ? (
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>
                            Remote lots: {bricklinkPreview.totalRemote} • Previewed{" "}
                            {bricklinkPreview.previewCount} • Existing in BrickOps:{" "}
                            {
                              bricklinkPreview.items.filter((item) => item.exists)
                                .length
                            }
                          </p>
                          <ul className="space-y-1">
                            {bricklinkPreview.items.slice(0, 5).map((item) => (
                              <li key={item.inventoryId} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {item.partNumber} · {item.name}
                                </span>
                                <span
                                  className={
                                    item.exists ? "text-destructive" : "text-emerald-600"
                                  }
                                >
                                  {item.exists ? "Already imported" : "New"}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {bricklinkPreview.items.length > 5 ? (
                            <p>Showing the first 5 preview lots.</p>
                          ) : null}
                        </div>
                      ) : null}
                      {bricklinkImportError ? (
                        <p className="text-xs text-destructive">{bricklinkImportError}</p>
                      ) : null}
                      {bricklinkImportResult ? (
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>
                            Imported {bricklinkImportResult.imported} new lots. Skipped existing:{" "}
                            {bricklinkImportResult.skippedExisting}. Skipped unavailable:{" "}
                            {bricklinkImportResult.skippedUnavailable}.
                          </p>
                          {bricklinkImportResult.errors.length > 0 ? (
                            <div>
                              <p className="font-semibold text-destructive">
                                {bricklinkImportResult.errors.length} errors
                              </p>
                              <ul className="mt-1 space-y-1 text-destructive">
                                {bricklinkImportResult.errors.slice(0, 5).map((error) => (
                                  <li key={error.identifier} className="truncate">
                                    {error.identifier}: {error.message}
                                  </li>
                                ))}
                              </ul>
                              {bricklinkImportResult.errors.length > 5 ? (
                                <p className="text-muted-foreground">
                                  Showing the first 5 errors.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-foreground">BrickOwl</h4>
                        <p className="text-xs text-muted-foreground">
                          Import active BrickOwl lots that match your BrickLink catalog.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePreviewBrickowlInventory}
                          disabled={isPreviewingBrickowl}
                        >
                          {isPreviewingBrickowl ? "Previewing..." : "Preview"}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleImportBrickowlInventory}
                          disabled={isImportingBrickowl}
                        >
                          {isImportingBrickowl ? "Importing..." : "Import All Lots"}
                        </Button>
                      </div>
                      {brickowlPreviewError ? (
                        <p className="text-xs text-destructive">{brickowlPreviewError}</p>
                      ) : null}
                      {brickowlPreview ? (
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>
                            Remote lots: {brickowlPreview.totalRemote} • Previewed{" "}
                            {brickowlPreview.previewCount} • Existing in BrickOps:{" "}
                            {
                              brickowlPreview.items.filter((item) => item.exists)
                                .length
                            }
                          </p>
                          <ul className="space-y-1">
                            {brickowlPreview.items.slice(0, 5).map((item) => (
                              <li key={`${item.boid}-${item.lotId ?? "preview"}`} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {item.partNumber ?? item.boid} ·{" "}
                                  {item.colorId ?? "color?"}
                                </span>
                                <span
                                  className={
                                    item.exists ? "text-destructive" : "text-emerald-600"
                                  }
                                >
                                  {item.exists ? "Already imported" : "New"}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {brickowlPreview.items.length > 5 ? (
                            <p>Showing the first 5 preview lots.</p>
                          ) : null}
                        </div>
                      ) : null}
                      {brickowlImportError ? (
                        <p className="text-xs text-destructive">{brickowlImportError}</p>
                      ) : null}
                      {brickowlImportResult ? (
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>
                            Imported {brickowlImportResult.imported} new lots. Skipped existing:{" "}
                            {brickowlImportResult.skippedExisting}. Skipped unavailable:{" "}
                            {brickowlImportResult.skippedUnavailable}.
                          </p>
                          {brickowlImportResult.errors.length > 0 ? (
                            <div>
                              <p className="font-semibold text-destructive">
                                {brickowlImportResult.errors.length} errors
                              </p>
                              <ul className="mt-1 space-y-1 text-destructive">
                                {brickowlImportResult.errors.slice(0, 5).map((error) => (
                                  <li key={error.identifier} className="truncate">
                                    {error.identifier}: {error.message}
                                  </li>
                                ))}
                              </ul>
                              {brickowlImportResult.errors.length > 5 ? (
                                <p className="text-muted-foreground">
                                  Showing the first 5 errors.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                {/* Trigger Mock Marketplace Order */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Mock Marketplace Order</h3>
                  <p className="text-xs text-muted-foreground">
                    Simulate marketplace order ingestion using your mock inventory. Choose BrickLink
                    or BrickOwl to test end-to-end order handling without hitting real APIs.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={mockOrderMarketplace}
                      onValueChange={(value: "bricklink" | "brickowl") =>
                        setMockOrderMarketplace(value)
                      }
                    >
                      <SelectTrigger
                        className="w-40"
                        data-testid="mock-order-marketplace-select"
                      >
                        <SelectValue placeholder="Select marketplace" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bricklink">BrickLink</SelectItem>
                        <SelectItem value="brickowl">BrickOwl</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={mockWebhookQuantity}
                      onChange={(e) => setMockWebhookQuantity(parseInt(e.target.value) || 1)}
                      className="w-24"
                      data-testid="mock-webhook-quantity-input"
                    />
                    <Button
                      type="button"
                      onClick={handleTriggerMockOrder}
                      disabled={isTriggeringMockWebhook}
                      data-testid="trigger-mock-webhook-button"
                    >
                      {isTriggeringMockWebhook
                        ? "Processing..."
                        : `Trigger Mock ${mockMarketplaceLabel} Order`}
                    </Button>
                  </div>
                </div>

                {/* Delete All Orders */}
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-medium text-foreground text-destructive">
                    Delete All Orders
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete all Bricklink orders and order items for this business
                    account. This action cannot be undone.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={isDeletingOrders}
                    data-testid="delete-all-orders-button"
                  >
                    {isDeletingOrders ? "Deleting..." : "Delete All Orders"}
                  </Button>
                </div>

                {/* Mock Inventory Generation */}
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-medium text-foreground">Mock Inventory</h3>
                  <p className="text-xs text-muted-foreground">
                    Generate mock inventory items using random parts and colors from your catalog.
                    Items will have random locations (A1-Z9), quantities (1-100), and prices
                    ($0.01-$10.00).
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={mockInventoryCount}
                      onChange={(e) => setMockInventoryCount(parseInt(e.target.value) || 30)}
                      className="w-24"
                      data-testid="mock-inventory-count-input"
                    />
                    <Button
                      type="button"
                      onClick={handleGenerateMockInventory}
                      disabled={isGeneratingInventory}
                      data-testid="generate-mock-inventory-button"
                    >
                      {isGeneratingInventory ? "Generating..." : "Generate Mock Inventory"}
                    </Button>
                  </div>
                </div>

                {/* Delete All Inventory */}
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-medium text-foreground text-destructive">
                    Delete All Inventory
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete all inventory items and ledger entries for this business
                    account. This action cannot be undone.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setInventoryDeleteDialogOpen(true)}
                    disabled={isDeletingInventory}
                    data-testid="delete-all-inventory-button"
                  >
                    {isDeletingInventory ? "Deleting..." : "Delete All Inventory"}
                  </Button>
                </div>

                {/* Status Messages */}
                {devMessage && (
                  <div
                    className={`mt-4 rounded-md p-3 text-sm ${
                      devMessage.type === "success"
                        ? "bg-green-50 text-green-800"
                        : "bg-red-50 text-red-800"
                    }`}
                    data-testid="dev-message"
                  >
                    {devMessage.text}
                  </div>
                )}
              </div>
            </section>
          </TabsContent>
        )}
      </Tabs>

      {/* Delete All Orders Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="delete-orders-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all Bricklink orders and order items for this business
              account. This action cannot be undone. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingOrders}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-orders-button"
              onClick={handleDeleteAllOrders}
              disabled={isDeletingOrders}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingOrders ? "Deleting..." : "Delete All Orders"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Inventory Confirmation Dialog */}
      <AlertDialog open={inventoryDeleteDialogOpen} onOpenChange={setInventoryDeleteDialogOpen}>
        <AlertDialogContent data-testid="delete-inventory-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Inventory?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all inventory items and ledger entries for this business
              account. This action cannot be undone. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingInventory}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-inventory-button"
              onClick={handleDeleteAllInventory}
              disabled={isDeletingInventory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingInventory ? "Deleting..." : "Delete All Inventory"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>Send an email invitation to join your workspace.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="invite-email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="invite-email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                data-testid="invite-email"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invite-role" className="text-sm font-medium text-foreground">
                Role
              </label>
              <select
                id="invite-role"
                className="rounded border bg-background px-2 py-1"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                data-testid="invite-role"
              >
                <option value="manager">manager</option>
                <option value="picker">picker</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
            {inviteResult && (
              <p className="text-sm text-green-600" data-testid="invite-result">
                {inviteResult}
              </p>
            )}
            {userError && (
              <p className="text-sm text-destructive" data-testid="invite-error">
                {userError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitInvite}
              disabled={isInviting}
              data-testid="invite-submit"
            >
              {isInviting ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
