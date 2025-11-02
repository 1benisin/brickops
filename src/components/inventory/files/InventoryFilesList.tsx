"use client";
import type { Route } from "next";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Search, Plus, Trash2, Eye } from "lucide-react";

export function InventoryFilesList() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<Id<"inventoryFiles"> | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Form state for creating files
  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  // Queries
  const files = useQuery(api.inventory.files.queries.listFiles, {
    includeDeleted: false,
  });

  // Mutations
  const createFile = useMutation(api.inventory.files.mutations.createFile);
  const deleteFile = useMutation(api.inventory.files.mutations.deleteFile);

  // Filter files by search term
  const filteredFiles = useMemo(() => {
    if (!files) return [];
    if (!searchTerm) return files;

    const term = searchTerm.toLowerCase();
    return files.filter(
      (file) =>
        file.name.toLowerCase().includes(term) ||
        (file.description && file.description.toLowerCase().includes(term)),
    );
  }, [files, searchTerm]);

  const canSubmit = useMemo(() => {
    return form.name.trim() !== "";
  }, [form.name]);

  const handleCreate = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      await createFile({
        name: form.name,
        description: form.description || undefined,
      });
      setCreateDialogOpen(false);
      setForm({ name: "", description: "" });
    });
  };

  const handleDeleteClick = (fileId: Id<"inventoryFiles">) => {
    setFileToDelete(fileId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!fileToDelete) return;
    startTransition(async () => {
      await deleteFile({ fileId: fileToDelete });
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    });
  };

  const handleView = (fileId: Id<"inventoryFiles">) => {
    router.push(`/inventory/files/${encodeURIComponent(fileId as unknown as string)}` as Route);
  };

  // Empty state
  if (!files) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-muted-foreground">Loading files...</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">No inventory files yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first file to organize batch imports.
          </p>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-file-button">
                <Plus className="mr-2 h-4 w-4" />
                Create File
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="create-file-dialog">
              <DialogHeader>
                <DialogTitle>Create Inventory File</DialogTitle>
                <DialogDescription>
                  Create a new file to organize inventory items for batch synchronization.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Input
                    data-testid="file-name-input"
                    placeholder="File name *"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Input
                    data-testid="file-description-input"
                    placeholder="Description (optional)"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  data-testid="save-file-button"
                  onClick={handleCreate}
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with search and create button */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="search-files-input"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-file-button">
              <Plus className="mr-2 h-4 w-4" />
              Create File
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="create-file-dialog">
            <DialogHeader>
              <DialogTitle>Create Inventory File</DialogTitle>
              <DialogDescription>
                Create a new file to organize inventory items for batch synchronization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Input
                  data-testid="file-name-input"
                  placeholder="File name *"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Input
                  data-testid="file-description-input"
                  placeholder="Description (optional)"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                data-testid="save-file-button"
                onClick={handleCreate}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Files table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Modified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No files found matching &quot;{searchTerm}&quot;
                </TableCell>
              </TableRow>
            ) : (
              filteredFiles.map((file) => (
                <TableRow key={file._id} data-testid="file-row">
                  <TableCell className="font-medium" data-testid="file-name">
                    {file.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground" data-testid="file-description">
                    {file.description || "-"}
                  </TableCell>
                  <TableCell className="text-right" data-testid="file-item-count">
                    <Badge variant="secondary">{file.itemCount}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm" data-testid="file-created">
                    {formatRelativeTime(file.createdAt)}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground text-sm"
                    data-testid="file-last-modified"
                  >
                    {formatRelativeTime(file.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="view-file-button"
                        onClick={() => handleView(file._id)}
                        title="View file details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="delete-file-button"
                        onClick={() => handleDeleteClick(file._id)}
                        title="Delete file"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="delete-file-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inventory File?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the file as deleted. Items in the file will remain in your inventory
              but will no longer be associated with this file. This action can be reversed by
              database administrators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-button"
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
