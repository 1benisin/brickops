import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";

type Role = "manager" | "picker" | "viewer";

interface SettingsDialogsProps {
  // Delete Orders Dialog
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  isDeletingOrders: boolean;
  onDeleteAllOrders: () => void;

  // Delete Inventory Dialog
  inventoryDeleteDialogOpen: boolean;
  setInventoryDeleteDialogOpen: (open: boolean) => void;
  isDeletingInventory: boolean;
  onDeleteAllInventory: () => void;

  // User Invite Dialog
  inviteOpen: boolean;
  setInviteOpen: (open: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: Role;
  setInviteRole: (role: Role) => void;
  inviteResult: string | null;
  userError: string | null;
  isInviting: boolean;
  onSubmitInvite: () => void;
}

export function SettingsDialogs({
  deleteDialogOpen,
  setDeleteDialogOpen,
  isDeletingOrders,
  onDeleteAllOrders,
  inventoryDeleteDialogOpen,
  setInventoryDeleteDialogOpen,
  isDeletingInventory,
  onDeleteAllInventory,
  inviteOpen,
  setInviteOpen,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviteResult,
  userError,
  isInviting,
  onSubmitInvite,
}: SettingsDialogsProps) {
  return (
    <>
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
              onClick={onDeleteAllOrders}
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
              onClick={onDeleteAllInventory}
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
              onClick={onSubmitInvite}
              disabled={isInviting}
              data-testid="invite-submit"
            >
              {isInviting ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
