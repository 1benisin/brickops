"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Button, Input } from "@/components/ui";

interface MemberRow {
  _id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role: "owner" | "manager" | "picker";
  status: "active" | "invited";
  isCurrentUser: boolean;
}

export default function SettingsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const members = useQuery(api.users.listMembers);
  const updateProfile = useMutation(api.users.updateProfile);
  const regenerateInviteCode = useMutation(api.users.regenerateInviteCode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [isUpdatingProfile, startProfileTransition] = useTransition();
  const [isRegenerating, startInviteTransition] = useTransition();

  useEffect(() => {
    if (currentUser?.user) {
      setFirstName(currentUser.user.firstName ?? "");
      setLastName(currentUser.user.lastName ?? "");
    }
  }, [currentUser?.user?.firstName, currentUser?.user?.lastName]);

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
        const message =
          error instanceof Error ? error.message : "Unable to regenerate invite code";
        setInviteFeedback(message);
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account settings</h1>
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
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={isUpdatingProfile}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input value={currentUser.user?.email ?? ""} disabled readOnly />
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
              <h2 className="text-lg font-semibold text-foreground">Team invite</h2>
              <p className="text-sm text-muted-foreground">
                Share this invite code during sign-up so teammates join the same business account.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={inviteCode} readOnly disabled className="sm:max-w-xs" />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCopyInvite} disabled={!inviteCode}>
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
            {inviteFeedback ? <p className="text-sm text-muted-foreground">{inviteFeedback}</p> : null}
            {!isOwner ? (
              <p className="text-xs text-muted-foreground">
                Invite code rotation is limited to business owners.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Team members</h2>
          <p className="text-sm text-muted-foreground">
            Everyone listed here shares access to inventory, orders, and catalog data for
            {" "}
            <span className="font-medium text-foreground">
              {currentUser.businessAccount?.name ?? "your business"}
            </span>
            .
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="grid grid-cols-4 gap-4 bg-muted/50 p-3 text-sm font-medium text-muted-foreground">
            <span>Name</span>
            <span>Role</span>
            <span>Status</span>
            <span>Email</span>
          </div>
          <div className="divide-y">
            {sortedMembers.map((member) => (
              <div key={member._id} className="grid grid-cols-4 gap-4 p-3 text-sm">
                <span className="font-medium text-foreground">
                  {member.name ?? `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "—"}
                  {member.isCurrentUser ? " (you)" : ""}
                </span>
                <span className="capitalize text-muted-foreground">{member.role}</span>
                <span className="capitalize text-muted-foreground">{member.status}</span>
                <span className="text-muted-foreground">{member.email ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
