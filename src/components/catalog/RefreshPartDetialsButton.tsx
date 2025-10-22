"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useGetPart } from "@/hooks/useGetPart";
import { useGetPartColors } from "@/hooks/useGetPartColors";

type RefreshPartDetialsButtonProps = {
  partNumber: string | null;
  className?: string;
};

export function RefreshPartDetialsButton({ partNumber, className }: RefreshPartDetialsButtonProps) {
  const { refresh: partRefresh, isRefreshing: partIsRefreshing } = useGetPart(partNumber);

  const { refresh: colorsRefresh, isRefreshing: colorsIsRefreshing } = useGetPartColors(partNumber);

  // Don't render if no part number
  if (!partNumber) return null;

  const isRefreshing = partIsRefreshing || colorsIsRefreshing;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        partRefresh();
        colorsRefresh();
      }}
      disabled={isRefreshing}
      title="Refresh data"
      className={className}
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
    </Button>
  );
}
