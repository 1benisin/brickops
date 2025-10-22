"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FileSelectorProps {
  value: Id<"inventoryFiles"> | "none" | "create-new" | undefined;
  onChange: (value: Id<"inventoryFiles"> | "none" | undefined) => void;
  label?: string;
  disabled?: boolean;
}

export function FileSelector({
  value,
  onChange,
  label = "Inventory File",
  disabled = false,
}: FileSelectorProps) {
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileDescription, setNewFileDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const files = useQuery(api.inventory.files.queries.listFiles, {
    includeDeleted: false,
  });

  const createFile = useMutation(api.inventory.files.mutations.createFile);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const handleSelectChange = (newValue: string) => {
    if (newValue === "create-new") {
      setIsCreatingFile(true);
      setNewFileName("");
      setNewFileDescription("");
    } else if (newValue === "none") {
      onChange("none");
      setIsCreatingFile(false);
    } else {
      onChange(newValue as Id<"inventoryFiles">);
      setIsCreatingFile(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;

    setIsSubmitting(true);
    try {
      const fileId = await createFile({
        name: newFileName,
        description: newFileDescription || undefined,
      });
      onChange(fileId);
      setIsCreatingFile(false);
      setNewFileName("");
      setNewFileDescription("");
    } catch (error) {
      console.error("Failed to create file:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCreate = () => {
    setIsCreatingFile(false);
    setNewFileName("");
    setNewFileDescription("");
    onChange("none");
  };

  const currentValue = value === "none" || value === undefined ? "none" : value;

  if (isCreatingFile) {
    return (
      <div className="space-y-3">
        <Label>{label} - Create New</Label>
        <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
          <div className="grid gap-2">
            <Input
              data-testid="new-file-name-input"
              placeholder="File name *"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="grid gap-2">
            <Input
              data-testid="new-file-description-input"
              placeholder="Description (optional)"
              value={newFileDescription}
              onChange={(e) => setNewFileDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelCreate}
              disabled={isSubmitting}
              data-testid="cancel-create-file-button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateFile}
              disabled={!newFileName.trim() || isSubmitting}
              data-testid="confirm-create-file-button"
            >
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="file-selector">{label}</Label>
      <Select value={currentValue} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger id="file-selector" data-testid="file-selector">
          <SelectValue placeholder="Select file..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None (Main Inventory)</SelectItem>
          {files && files.length > 0 && (
            <>
              <SelectItem value="create-new" className="font-medium text-primary">
                + Create New File...
              </SelectItem>
              {files.map((file) => (
                <SelectItem key={file._id} value={file._id}>
                  {formatDate(file.createdAt)} - {file.name} - {file.itemCount} items
                </SelectItem>
              ))}
            </>
          )}
          {(!files || files.length === 0) && (
            <SelectItem value="create-new" className="font-medium text-primary">
              + Create New File...
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {value && value !== "none" && (
        <p className="text-xs text-muted-foreground">
          Items added to a file will not automatically sync to marketplaces
        </p>
      )}
    </div>
  );
}
