"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import type { ImportSummary } from "@/convex/inventory/validators";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { TeamTab } from "@/components/settings/TeamTab";
import { PreferencesTab } from "@/components/settings/PreferencesTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { DevelopmentTab } from "@/components/settings/DevelopmentTab";
import { SettingsDialogs } from "@/components/settings/SettingsDialogs";

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
  const updateSyncSettings = useMutation(api.marketplaces.shared.credentials.updateSyncSettings);
  const syncSettings = useQuery(api.marketplaces.shared.credentials.getSyncSettings);
  const isDevEnvironment = useQuery(api.orders.mocks.isDevelopmentEnvironment);
  const deleteAllOrders = useMutation(api.orders.mocks.deleteAllOrders);
  const triggerMockWebhook = useMutation(
    api.marketplaces.bricklink.orders.mocks.triggerMockWebhookNotification,
  );
  const triggerMockBrickOwlOrder = useMutation(
    api.marketplaces.brickowl.mockOrders.triggerMockOrder,
  );
  const generateMockInventory = useMutation(api.inventory.mocks.generateMockInventoryItems);
  const deleteAllInventory = useAction(api.inventory.mocks.deleteAllInventoryItems);
  const importBricklinkInventoryAction = useAction(
    api.inventory.import.initialBricklinkInventoryImport,
  );

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
  const [bricklinkImportResult, setBricklinkImportResult] = useState<ImportSummary | null>(null);
  const [bricklinkImportError, setBricklinkImportError] = useState<string | null>(null);
  const [isImportingBricklink, setIsImportingBricklink] = useState(false);

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
        text: result.message || `Mock ${mockMarketplaceLabel} order processed successfully`,
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
        text: `Successfully deleted ${result.deletedItems} inventory items, ${result.deletedQuantityLedgerEntries} quantity ledger entries, ${result.deletedLocationLedgerEntries} location ledger entries, and ${result.deletedMarketplaceOutboxMessages} marketplace outbox messages.`,
      });
      setTimeout(() => setDevMessage(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete inventory";
      setDevMessage({ type: "error", text: message });
    } finally {
      setIsDeletingInventory(false);
    }
  };

  const handleImportBricklinkInventory = async () => {
    setIsImportingBricklink(true);
    setBricklinkImportError(null);
    setBricklinkImportResult(null);
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
          <ProfileTab
            firstName={firstName}
            setFirstName={setFirstName}
            lastName={lastName}
            setLastName={setLastName}
            email={currentUser.user?.email ?? ""}
            role={currentUser.user?.role ?? ""}
            profileError={profileError}
            profileSuccess={profileSuccess}
            isUpdatingProfile={isUpdatingProfile}
            onProfileSubmit={handleProfileSubmit}
          />
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-6">
          <TeamTab
            inviteCode={inviteCode}
            isOwner={isOwner}
            isRegenerating={isRegenerating}
            inviteFeedback={inviteFeedback}
            onCopyInvite={handleCopyInvite}
            onRegenerateInvite={handleRegenerateInvite}
            businessName={currentUser.businessAccount?.name ?? "your business"}
            sortedMembers={sortedMembers}
            userError={userError}
            isUpdatingRoleId={isUpdatingRoleId}
            isRemovingId={isRemovingId}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
            onInviteClick={() => setInviteOpen(true)}
          />
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <PreferencesTab
            useSortLocations={useSortLocations}
            isUpdatingPreferences={isUpdatingPreferences}
            onSortLocationsToggle={handleSortLocationsToggle}
          />
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          <IntegrationsTab
            isOwner={isOwner}
            syncSettings={syncSettings}
            onSyncSettingsChange={handleSyncSettingsChange}
          />
        </TabsContent>

        {/* Development Tab */}
        {isDevEnvironment && (
          <TabsContent value="development" className="space-y-6">
            <DevelopmentTab
              isImportingBricklink={isImportingBricklink}
              bricklinkImportError={bricklinkImportError}
              bricklinkImportResult={bricklinkImportResult}
              onImportBricklink={handleImportBricklinkInventory}
              mockOrderMarketplace={mockOrderMarketplace}
              setMockOrderMarketplace={setMockOrderMarketplace}
              mockWebhookQuantity={mockWebhookQuantity}
              setMockWebhookQuantity={setMockWebhookQuantity}
              isTriggeringMockWebhook={isTriggeringMockWebhook}
              mockMarketplaceLabel={mockMarketplaceLabel}
              onTriggerMockOrder={handleTriggerMockOrder}
              isDeletingOrders={isDeletingOrders}
              onDeleteAllOrdersClick={() => setDeleteDialogOpen(true)}
              mockInventoryCount={mockInventoryCount}
              setMockInventoryCount={setMockInventoryCount}
              isGeneratingInventory={isGeneratingInventory}
              onGenerateMockInventory={handleGenerateMockInventory}
              isDeletingInventory={isDeletingInventory}
              onDeleteAllInventoryClick={() => setInventoryDeleteDialogOpen(true)}
              devMessage={devMessage}
            />
          </TabsContent>
        )}
      </Tabs>

      <SettingsDialogs
        deleteDialogOpen={deleteDialogOpen}
        setDeleteDialogOpen={setDeleteDialogOpen}
        isDeletingOrders={isDeletingOrders}
        onDeleteAllOrders={handleDeleteAllOrders}
        inventoryDeleteDialogOpen={inventoryDeleteDialogOpen}
        setInventoryDeleteDialogOpen={setInventoryDeleteDialogOpen}
        isDeletingInventory={isDeletingInventory}
        onDeleteAllInventory={handleDeleteAllInventory}
        inviteOpen={inviteOpen}
        setInviteOpen={setInviteOpen}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        inviteResult={inviteResult}
        userError={userError}
        isInviting={isInviting}
        onSubmitInvite={submitInvite}
      />
    </div>
  );
}
