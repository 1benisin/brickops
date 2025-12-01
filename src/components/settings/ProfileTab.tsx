import { Button, Input } from "@/components/ui";

interface ProfileTabProps {
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  email: string;
  role: string;
  profileError: string | null;
  profileSuccess: string | null;
  isUpdatingProfile: boolean;
  onProfileSubmit: () => void;
}

export function ProfileTab({
  firstName,
  setFirstName,
  lastName,
  setLastName,
  email,
  role,
  profileError,
  profileSuccess,
  isUpdatingProfile,
  onProfileSubmit,
}: ProfileTabProps) {
  return (
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
              value={email}
              disabled
              readOnly
            />
          </div>
        </div>

        {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
        {profileSuccess ? <p className="text-sm text-green-600">{profileSuccess}</p> : null}

        <Button type="button" onClick={onProfileSubmit} disabled={isUpdatingProfile}>
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
            <span className="capitalize text-muted-foreground">{role ?? "—"}</span>
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {role === "owner" ? (
              <>
                <li>Full access to all features including user management and account settings</li>
                <li>Can invite, remove, and change roles of users</li>
                <li>Can rotate the business invite code</li>
              </>
            ) : null}
            {role === "manager" ? (
              <>
                <li>Full inventory and order management</li>
                <li>Cannot manage users or account settings</li>
              </>
            ) : null}
            {role === "picker" ? (
              <>
                <li>Access to picking workflows and inventory adjustments</li>
                <li>Read-only elsewhere</li>
              </>
            ) : null}
            {role === "viewer" ? (
              <>
                <li>Read-only access to inventory and orders</li>
                <li>Cannot make changes</li>
              </>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
