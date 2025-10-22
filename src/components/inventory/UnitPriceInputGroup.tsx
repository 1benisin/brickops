"use client";

import { ChevronDownIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type UnitPriceInputGroupProps = {
  priceValue: string | undefined;
  onPriceChange: (value: string) => void;
  guideTypeValue: "stock" | "sold";
  onGuideTypeChange: (value: "stock" | "sold") => void;
  guideStatValue: "min" | "max" | "avg" | "qty_avg";
  onGuideStatChange: (value: "min" | "max" | "avg" | "qty_avg") => void;
  placeholder?: string;
};

export function UnitPriceInputGroup({
  priceValue = "",
  onPriceChange,
  guideTypeValue,
  onGuideTypeChange,
  guideStatValue,
  onGuideStatChange,
  placeholder = "0.00",
}: UnitPriceInputGroupProps) {
  const guideTypeLabel = guideTypeValue === "stock" ? "For Sale" : "Sold";
  const guideStatLabel = guideStatValue
    .replace("_", " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return (
    <InputGroup className="[--radius:0.5rem]">
      <InputGroupInput
        type="number"
        step="0.01"
        min={0}
        placeholder={placeholder}
        value={priceValue ?? ""}
        onChange={(e) => onPriceChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
      />
      <InputGroupAddon align="inline-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="px-3 py-1 text-xs font-medium hover:bg-accent cursor-pointer flex items-center gap-1"
            >
              {guideTypeLabel} <ChevronDownIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onGuideTypeChange("stock")}>For Sale</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGuideTypeChange("sold")}>
              Sold (6mo)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="px-3 py-1 text-xs font-medium hover:bg-accent cursor-pointer flex items-center gap-1"
            >
              {guideStatLabel} <ChevronDownIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onGuideStatChange("avg")}>Avg</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGuideStatChange("qty_avg")}>
              Qty avg
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGuideStatChange("min")}>Min</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGuideStatChange("max")}>Max</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </InputGroupAddon>
    </InputGroup>
  );
}
