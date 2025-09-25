"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import Link from "next/link";

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

export default function UsersSettingsPage() {
  const router = useRouter();
  const authState = useQuery(api.functions.users.getAuthState);
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const members = useQuery(api.functions.users.listMembers);
  const updateUserRole = useMutation(api.functions.users.updateUserRole);
  const removeUser = useMutation(api.functions.users.removeUser);
  const createUserInvite = useMutation(api.functions.users.createUserInvite);

  const [isInviting, startInviteTransition] = useTransition();
  const [isUpdatingRoleId, setIsUpdatingRoleId] = useState<string | null>(null);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("manager");
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteOpen) {
      setInviteEmail("");
      setInviteRole("manager");
      setInviteResult(null);
      setError(null);
    }
  }, [inviteOpen]);

  const isOwner = currentUser?.user?.role === "owner";

  const sortedMembers: MemberRow[] = useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;
      return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
    }) as MemberRow[];
  }, [members]);

  const handleRoleChange = async (member: MemberRow, role: Role) => {
    if (!isOwner || member.isCurrentUser) return;
    try {
      setError(null);
      setIsUpdatingRoleId(member._id);
      await updateUserRole({ targetUserId: member._id as unknown as Id<"users">, role });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update role";
      setError(message);
    } finally {
      setIsUpdatingRoleId(null);
    }
  };

  const handleRemove = async (member: MemberRow) => {
    if (!isOwner || member.isCurrentUser) return;
    try {
      setError(null);
      setIsRemovingId(member._id);
      await removeUser({ targetUserId: member._id as unknown as Id<"users"> });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove user";
      setError(message);
    } finally {
      setIsRemovingId(null);
    }
  };

  const handleInvite = () => {
    if (!isOwner) return;
    setInviteOpen(true);
  };

  const submitInvite = async () => {
    if (!inviteEmail.trim()) {
      setError("Email is required");
      return;
    }
    startInviteTransition(async () => {
      try {
        setError(null);
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
        setError(message);
      }
    });
  };

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
      <div className="space-y-4" data-testid="users-loading">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">Manage access to your workspace.</p>
        </div>
        <Button asChild variant="link" data-testid="nav-settings-link">
          <Link href="/settings">Back to settings</Link>
        </Button>
        {isOwner ? (
          <Button type="button" onClick={handleInvite} data-testid="invite-button">
            Invite user
          </Button>
        ) : null}
      </header>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

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
            {inviteResult ? (
              <p className="text-sm text-green-600" data-testid="invite-result">
                {inviteResult}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive" data-testid="invite-error">
                {error}
              </p>
            ) : null}
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
