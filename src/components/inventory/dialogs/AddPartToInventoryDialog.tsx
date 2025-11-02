"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { FileSelector } from "../files/FileSelector";
import { ColorSelect } from "@/components/catalog/ColorSelect";
import { PartPriceGuide } from "@/components/catalog/PartPriceGuide";
import { UnitPriceInputGroup } from "../shared/UnitPriceInputGroup";
import { useGetPart } from "@/hooks/useGetPart";
import { useGetPartColors } from "@/hooks/useGetPartColors";
import { useGetPriceGuide } from "@/hooks/useGetPriceGuide";
import { ColorPartImage } from "@/components/common/ColorPartImage";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { PriceGuide } from "@/types/catalog";
import type { ItemCondition } from "@/types/inventory";

const addInventorySchema = z.object({
  colorId: z.string().min(1, "Color is required"),
  location: z.string().min(1, "Location is required"),
  quantityAvailable: z.number().min(1, "Quantity must be at least 1"),
  condition: z.enum(["new", "used"]),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Price must be a valid number",
    }),
  fileId: z.union([z.string(), z.literal("none")]),

  // price helper controls (ui-only)
  priceHelperType: z.enum(["stock", "sold"]),
  priceHelperStat: z.enum(["min", "max", "avg", "qty_avg"]),
});
type AddInventoryFormData = z.infer<typeof addInventorySchema>;

type LastUsedInventorySettings = {
  condition: ItemCondition;
  location: string;
  colorId: string;
  fileId: Id<"inventoryFiles"> | "none";
  priceHelperType: "stock" | "sold";
  priceHelperStat: "min" | "max" | "avg" | "qty_avg";
};

export type AddPartToInventoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber: string | null;
  defaultFileId?: Id<"inventoryFiles"> | "none";
};

/** map guide -> value */
function getPriceFromGuide(
  guide: PriceGuide | null | undefined,
  condition: ItemCondition,
  type: "stock" | "sold",
  stat: "min" | "max" | "avg" | "qty_avg",
): number | null {
  if (!guide) return null;
  const key = `${condition}${type.charAt(0).toUpperCase() + type.slice(1)}` as
    | "newStock"
    | "newSold"
    | "usedStock"
    | "usedSold";
  const row = guide[key];
  if (!row) return null;
  const field =
    stat === "min"
      ? "minPrice"
      : stat === "max"
        ? "maxPrice"
        : stat === "avg"
          ? "avgPrice"
          : "qtyAvgPrice";
  return row[field] ?? null;
}

/** tiny hook: keeps price synced from guide whenever condition/type/stat change */
function useAutoPriceFromGuide(opts: {
  form: ReturnType<typeof useForm<AddInventoryFormData>>;
  priceGuide: PriceGuide | undefined | null;
}) {
  const { form, priceGuide } = opts;
  const watched = form.watch(["colorId", "condition", "priceHelperType", "priceHelperStat"]);

  useEffect(() => {
    const [colorId, cond, type, stat] = watched as [
      string,
      ItemCondition,
      "stock" | "sold",
      "min" | "max" | "avg" | "qty_avg",
    ];
    if (!colorId || !priceGuide) return;

    const val = getPriceFromGuide(priceGuide, cond, type, stat);
    if (val == null) return;

    const computed = val.toFixed(2);
    form.setValue("price", computed, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceGuide, ...watched]);
}

export function AddPartToInventoryDialog({
  open,
  onOpenChange,
  partNumber,
  defaultFileId,
}: AddPartToInventoryDialogProps) {
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;

  const { data: part, isLoading: isLoadingPart } = useGetPart(partNumber ?? null);
  const { data: availableColors } = useGetPartColors(partNumber ?? null);
  const addInventoryItem = useMutation(api.inventory.mutations.addInventoryItem);
  const [isSubmitting, startTransition] = useTransition();

  // Track if form has been initialized for the current part to prevent re-initialization
  const initializedForPartRef = useRef<string | null>(null);

  // Persist last-used UI choices
  const [lastUsed, setLastUsed] = useLocalStorage<LastUsedInventorySettings>(
    "brickops:inventory:lastUsed",
    {
      condition: "new",
      location: "",
      colorId: "",
      fileId: "none",
      priceHelperType: "stock",
      priceHelperStat: "avg",
    },
  );

  const form = useForm<AddInventoryFormData>({
    resolver: zodResolver(addInventorySchema),
    defaultValues: {
      location: "",
      quantityAvailable: 1,
      condition: "new",
      colorId: "",
      fileId: "none",
      price: "",
      priceHelperType: "stock",
      priceHelperStat: "avg",
    },
    mode: "onChange",
  });

  // derive numeric color for the guide (reactive)
  const colorId = useWatch({ control: form.control, name: "colorId" });
  const colorIdNumber = useMemo(() => {
    return colorId ? parseInt(colorId, 10) : null;
  }, [colorId]);

  // Helper: validate colorId against available colors, return first color if invalid
  const getValidColorId = useMemo(() => {
    if (!availableColors || availableColors.length === 0) return null;

    const colorIds = availableColors.map((c) => String(c.colorId));
    const savedColorId = lastUsed.colorId;

    // If saved color exists for this part, use it
    if (savedColorId && colorIds.includes(savedColorId)) {
      return savedColorId;
    }

    // Otherwise, default to first available color
    return colorIds[0] || null;
  }, [availableColors, lastUsed.colorId]);

  const { data: priceGuide } = useGetPriceGuide(partNumber, colorIdNumber);

  // Get color-specific image for selected color
  // Image handled by ColorPartImage component

  // Reset initialization flag when dialog closes or part changes
  useEffect(() => {
    if (!open) {
      initializedForPartRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (partNumber && initializedForPartRef.current !== partNumber) {
      initializedForPartRef.current = null;
    }
  }, [partNumber]);

  // Coordinated initialization: wait for all data, then populate form in sequence
  useEffect(() => {
    // Step 1: Check if dialog is open and part is loaded
    if (!open || !part) return;

    // Skip if already initialized for this part
    if (initializedForPartRef.current === part.partNumber) return;

    // Step 2: Wait for colors to load
    if (!availableColors || availableColors.length === 0) return;

    // Step 3: Determine valid colorId (from localStorage or first color)
    const validColorId = getValidColorId;
    if (!validColorId) return;

    // Step 4: Wait for price guide to load for the selected color
    // (priceGuide loads based on colorIdNumber which is derived from form.watch("colorId"))
    // On first load, we need to set the color first, then wait for price guide
    const currentColorId = form.getValues("colorId");

    // If color hasn't been set yet, set it and wait for next render cycle
    if (currentColorId !== validColorId) {
      form.setValue("colorId", validColorId, { shouldValidate: false });
      return;
    }

    // Step 5: Now that color is set, wait for price guide
    if (!priceGuide) return;

    // Step 6: All data is ready - populate all form fields
    const condition = lastUsed.condition || "new";
    const priceHelperType = lastUsed.priceHelperType || "stock";
    const priceHelperStat = lastUsed.priceHelperStat || "avg";

    // Calculate price from guide
    const priceValue = getPriceFromGuide(priceGuide, condition, priceHelperType, priceHelperStat);
    const priceString = priceValue != null ? priceValue.toFixed(2) : "";

    // Set all fields at once
    form.reset(
      {
        location: lastUsed.location || "",
        quantityAvailable: 1,
        condition,
        colorId: validColorId,
        fileId: lastUsed.fileId || defaultFileId || "none",
        price: priceString,
        priceHelperType,
        priceHelperStat,
      },
      { keepDirty: false },
    );

    // Step 7: Trigger validation to enable button
    setTimeout(() => form.trigger(), 0);

    // Mark as initialized for this part
    initializedForPartRef.current = part.partNumber;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part, availableColors, getValidColorId, priceGuide, form]);

  // Keep price synced when user changes condition/type/stat after initialization
  useAutoPriceFromGuide({ form, priceGuide });

  // keep lastUsed in sync anytime relevant fields change while sheet is open
  useEffect(() => {
    if (!open) return;
    const subscription = form.watch((vals) => {
      setLastUsed({
        condition: (vals.condition as "new" | "used") ?? "new",
        location: vals.location ?? "",
        colorId: vals.colorId ?? "",
        fileId: (vals.fileId as Id<"inventoryFiles"> | "none") ?? "none",
        priceHelperType: (vals.priceHelperType as "stock" | "sold") ?? "stock",
        priceHelperStat: (vals.priceHelperStat as "min" | "max" | "avg" | "qty_avg") ?? "avg",
      });
    });
    return () => subscription.unsubscribe();
  }, [form, open, setLastUsed]);

  const onSubmit = (data: AddInventoryFormData) => {
    if (!part) return;

    startTransition(async () => {
      await addInventoryItem({
        name: part.name,
        partNumber: part.partNumber,
        colorId: data.colorId,
        location: data.location,
        quantityAvailable: data.quantityAvailable,
        condition: data.condition,
        price: Number(data.price),
        fileId:
          data.fileId && data.fileId !== "none" ? (data.fileId as Id<"inventoryFiles">) : undefined,
      });
      onOpenChange(false);
    });
  };

  const loading = isLoadingPart;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="overflow-y-auto  h-[90vh]">
        <SheetHeader className="pb-4">
          <SheetTitle className="sr-only">Add Part to Inventory</SheetTitle>
          <SheetDescription>
            {loading
              ? "Loading part details…"
              : `${part?.name ?? "Part"} · ${part?.partNumber ?? "—"}`}
          </SheetDescription>
          {/* Part Image */}
          {part && (
            <div className="relative h-32 w-32 flex-shrink-0 self-center mt-2">
              <ColorPartImage
                partNumber={partNumber}
                colorId={colorIdNumber}
                alt={part.name}
                fill
                sizes="128px"
                unoptimized
              />
            </div>
          )}
        </SheetHeader>

        {loading ? (
          <div className="flex-1 grid place-items-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent" />
          </div>
        ) : !part ? (
          <div className="flex-1 grid place-items-center">
            <div className="text-sm text-muted-foreground">Part not found</div>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="mt-2">
              Close
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col">
              <div className="flex-1 space-y-3">
                {/* Core fields */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField<AddInventoryFormData, "colorId">
                    control={form.control}
                    name="colorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Color</FormLabel>
                        <FormControl>
                          <ColorSelect
                            partNumber={partNumber}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select color..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField<AddInventoryFormData, "location">
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Location</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Shelf A1"
                            onFocus={(e) => e.target.select()}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField<AddInventoryFormData, "quantityAvailable">
                    control={form.control}
                    name="quantityAvailable"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField<AddInventoryFormData, "condition">
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Condition</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select condition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="used">Used</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField<AddInventoryFormData, "price">
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Unit Price</FormLabel>
                        <FormControl>
                          <UnitPriceInputGroup
                            priceValue={field.value}
                            onPriceChange={field.onChange}
                            guideTypeValue={form.getValues("priceHelperType")}
                            onGuideTypeChange={(value) => form.setValue("priceHelperType", value)}
                            guideStatValue={form.getValues("priceHelperStat")}
                            onGuideStatChange={(value) => form.setValue("priceHelperStat", value)}
                          />
                        </FormControl>
                        <FormDescription className="text-[11px]">
                          Auto-filled from {form.getValues("condition")} ·{" "}
                          {form.getValues("priceHelperType")} ·{" "}
                          {form.getValues("priceHelperStat").replace("_", " ")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* File selection */}
                {businessAccountId && (
                  <FormField<AddInventoryFormData, "fileId">
                    control={form.control}
                    name="fileId"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <FileSelector
                            value={field.value as Id<"inventoryFiles"> | "none" | undefined}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {/* Inline price guide to cross-check visually */}
                <PartPriceGuide
                  partNumber={partNumber}
                  colorId={form.getValues("colorId") || null}
                />
              </div>

              <div className="border-t py-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!form.formState.isValid || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? "Adding…" : "Add to Inventory"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
}
