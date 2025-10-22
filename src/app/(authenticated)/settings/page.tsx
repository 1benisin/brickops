"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, ChevronDown, ChevronUp, UserPlus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

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
} from "@/components/ui";
import { BrickLinkCredentialsForm } from "@/components/settings/BricklinkCredentialsForm";
import { BrickOwlCredentialsForm } from "@/components/settings/BrickowlCredentialsForm";

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
  const authState = useQuery(api.users.queries.getAuthState);
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const members = useQuery(api.users.queries.listMembers);
  const updateProfile = useMutation(api.users.mutations.updateProfile);
  const regenerateInviteCode = useMutation(api.users.mutations.regenerateInviteCode);
  const updateUserRole = useMutation(api.users.mutations.updateUserRole);
  const removeUser = useMutation(api.users.mutations.removeUser);
  const createUserInvite = useMutation(api.users.mutations.createUserInvite);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [isUpdatingProfile, startProfileTransition] = useTransition();
  const [isRegenerating, startInviteTransition] = useTransition();
  const [isMarketplaceExpanded, setIsMarketplaceExpanded] = useState(false);
  const [isUsersExpanded, setIsUsersExpanded] = useState(false);

  // User management state
  const [isInviting, startUserInviteTransition] = useTransition();
  const [isUpdatingRoleId, setIsUpdatingRoleId] = useState<string | null>(null);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("manager");
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.user) {
      setFirstName(currentUser.user.firstName ?? "");
      setLastName(currentUser.user.lastName ?? "");
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

  const sortedMembers: MemberRow[] = useMemo(() => {
    if (!members) return [];
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
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Account settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Update your personal details and manage workspace access for your team.
          </p>
        </div>

        <div className="grid gap-6 rounded-lg border bg-background p-6 shadow-sm md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Profile</h2>
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
              <h2 className="text-lg font-semibold text-foreground">Your role & permissions</h2>
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

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Team invite</h2>
              <p className="text-sm text-muted-foreground">
                Share this invite code during sign-up so teammates join the same business account.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRegenerateInvite}
                  disabled={!isOwner || isRegenerating}
                >
                  <RefreshCw className="mr-2 size-4" />
                  {isRegenerating ? "Rotating…" : "Rotate"}
                </Button>
              </div>
            </div>
            {inviteFeedback ? (
              <p className="text-sm text-muted-foreground">{inviteFeedback}</p>
            ) : null}
            {!isOwner ? (
              <p className="text-xs text-muted-foreground">
                Invite code rotation is limited to business owners.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {isOwner && (
        <section className="space-y-4">
          <div className="rounded-lg border bg-background shadow-sm">
            <button
              onClick={() => setIsMarketplaceExpanded(!isMarketplaceExpanded)}
              className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/50"
            >
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Marketplace Credentials{" "}
                  <span className="text-sm font-normal text-muted-foreground">(Owner only)</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Connect your marketplace accounts to BrickOps. You can connect to BrickLink,
                  BrickOwl, or both.
                </p>
              </div>
              {isMarketplaceExpanded ? (
                <ChevronUp className="size-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-5 text-muted-foreground" />
              )}
            </button>

            {isMarketplaceExpanded && (
              <div className="space-y-6 border-t p-6">
                {/* BrickLink Credentials Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      BrickLink Credentials{" "}
                      <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Connect your BrickLink store using OAuth 1.0a credentials. Only configure this
                      if you sell on BrickLink.
                    </p>
                  </div>
                  <BrickLinkCredentialsForm />
                </div>

                {/* BrickOwl Credentials Section */}
                <div className="space-y-4 border-t pt-6">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      BrickOwl Credentials{" "}
                      <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Connect your BrickOwl store using your API key. Only configure this if you
                      sell on BrickOwl.
                    </p>
                  </div>
                  <BrickOwlCredentialsForm />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="rounded-lg border bg-background shadow-sm">
          <button
            onClick={() => setIsUsersExpanded(!isUsersExpanded)}
            className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/50"
          >
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
            {isUsersExpanded ? (
              <ChevronUp className="size-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-5 text-muted-foreground" />
            )}
          </button>

          {isUsersExpanded && (
            <div className="space-y-4 border-t p-6">
              {isOwner && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    data-testid="invite-button"
                  >
                    <UserPlus className="mr-2 size-4" />
                    Invite user
                  </Button>
                </div>
              )}

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
                    <div
                      key={member._id}
                      className="grid grid-cols-5 items-center gap-4 p-3 text-sm"
                    >
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
                              if (
                                window.confirm(`Are you sure you want to remove ${displayName}?`)
                              ) {
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
            </div>
          )}
        </div>
      </section>

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
