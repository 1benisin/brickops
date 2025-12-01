import { Button, Input } from "@/components/ui";
import { Copy, RefreshCw, UserPlus } from "lucide-react";

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

interface TeamTabProps {
  inviteCode: string;
  isOwner: boolean;
  isRegenerating: boolean;
  inviteFeedback: string | null;
  onCopyInvite: () => void;
  onRegenerateInvite: () => void;
  businessName: string;
  sortedMembers: MemberRow[];
  userError: string | null;
  isUpdatingRoleId: string | null;
  isRemovingId: string | null;
  onRoleChange: (member: MemberRow, role: Role) => void;
  onRemove: (member: MemberRow) => void;
  onInviteClick: () => void;
}

export function TeamTab({
  inviteCode,
  isOwner,
  isRegenerating,
  inviteFeedback,
  onCopyInvite,
  onRegenerateInvite,
  businessName,
  sortedMembers,
  userError,
  isUpdatingRoleId,
  isRemovingId,
  onRoleChange,
  onRemove,
  onInviteClick,
}: TeamTabProps) {
  return (
    <>
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
            <Button type="button" variant="outline" onClick={onCopyInvite} disabled={!inviteCode}>
              <Copy className="mr-2 size-4" /> Copy
            </Button>
            {isOwner && (
              <Button
                type="button"
                variant="ghost"
                onClick={onRegenerateInvite}
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
              <span className="font-medium text-foreground">{businessName}</span>.
            </p>
          </div>
          {isOwner && (
            <Button type="button" onClick={onInviteClick} data-testid="invite-button">
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
                      onChange={(e) => onRoleChange(member, e.target.value as Role)}
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
                          onRemove(member);
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
    </>
  );
}
