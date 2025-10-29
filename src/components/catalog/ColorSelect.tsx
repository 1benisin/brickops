"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bestTextOn } from "@/lib/utils";
import { useGetPartColors } from "@/hooks/useGetPartColors";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { PartColor } from "@/types/catalog";

type ColorSelectProps = {
  partNumber: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function ColorSelect({
  partNumber,
  value,
  onChange,
  placeholder = "Select a color...",
  className,
}: ColorSelectProps) {
  // Fetch colors for this part
  const { data: colors } = useGetPartColors(partNumber);

  // We intentionally do not fetch or show color thumbnail images

  // Persist last used color
  const [lastUsedValues, setLastUsedValues] = useLocalStorage<{ colorId?: string }>(
    "brickops:inventory:lastUsed",
    {},
  );

  // Convert colors to ColorOption format
  const colorOptions =
    colors?.map((c: PartColor) => ({
      value: String(c.colorId),
      label: c.name || `Color ${c.colorId}`,
      hex: c.hexCode || "ffffff",
    })) ?? [];

  // Smart color selection: use last used color if it exists for this part
  const getSmartDefaultColor = () => {
    if (!lastUsedValues.colorId || colorOptions.length === 0) {
      return colorOptions[0]?.value || "";
    }

    const colorExists = colorOptions.some((c) => c.value === lastUsedValues.colorId);
    return colorExists ? lastUsedValues.colorId : colorOptions[0]?.value || "";
  };

  // If no value is set, use smart default
  const effectiveValue = value || getSmartDefaultColor();

  // Save selected color to localStorage when it changes
  const handleChange = (newValue: string) => {
    onChange(newValue);
    setLastUsedValues({ colorId: newValue });
  };

  // Find the selected color to apply its background
  const selectedColor = colorOptions.find((c) => c.value === effectiveValue);
  const selectedBgColor = selectedColor ? `#${selectedColor.hex}` : undefined;
  const selectedTextColor = selectedColor ? bestTextOn(selectedBgColor ?? "").color : undefined;

  return (
    <Select value={effectiveValue} onValueChange={handleChange}>
      <SelectTrigger
        className={className}
        style={
          selectedColor
            ? {
                backgroundColor: selectedBgColor,
                color: selectedTextColor,
              }
            : undefined
        }
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="">
        {colorOptions.map((option) => (
          <ColorSelectItem key={option.value} option={option} partNumber={partNumber} />
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Helper component for individual color select items
 * Displays color image thumbnail when available, falls back to colored square
 */
function ColorSelectItem({
  option,
  partNumber: _partNumber,
}: {
  option: { value: string; label: string; hex: string };
  partNumber: string | null;
}) {
  const bgColor = `#${option.hex}`;
  const { color: textColor } = bestTextOn(bgColor);

  return (
    <SelectItem
      key={option.value}
      value={option.value}
      className="cursor-pointer rounded-none"
      style={{
        backgroundColor: bgColor,
        color: textColor,
      }}
    >
      <span>{option.label}</span>
    </SelectItem>
  );
}
