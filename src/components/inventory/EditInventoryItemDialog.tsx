"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

import { ColorSelect } from "@/components/catalog/ColorSelect";
import { PartPriceGuide } from "@/components/catalog/PartPriceGuide";
import { UnitPriceInputGroup } from "./UnitPriceInputGroup";
import { useGetPart } from "@/hooks/useGetPart";
import { useGetPriceGuide } from "@/hooks/useGetPriceGuide";
import { ColorPartImage } from "@/components/common/ColorPartImage";
import type { InventoryItem, ItemCondition } from "@/types/inventory";
import type { PriceGuide } from "@/types/catalog";

const editInventorySchema = z.object({
  colorId: z.string().min(1, "Color is required"),
  location: z.string().min(1, "Location is required"),
  quantityAvailable: z.number().min(0, "Quantity must be at least 0"),
  quantityReserved: z.number().min(0, "Quantity must be at least 0"),
  condition: z.enum(["new", "used"]),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Price must be a valid number",
    }),
  notes: z.string().optional(),

  // price helper controls (ui-only)
  priceHelperType: z.enum(["stock", "sold"]),
  priceHelperStat: z.enum(["min", "max", "avg", "qty_avg"]),
});
type EditInventoryFormData = z.infer<typeof editInventorySchema>;

export type EditInventoryItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
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
  form: ReturnType<typeof useForm<EditInventoryFormData>>;
  priceGuide: PriceGuide | null | undefined;
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

export function EditInventoryItemDialog({
  open,
  onOpenChange,
  item,
}: EditInventoryItemDialogProps) {
  const updateInventoryItem = useMutation(api.inventory.mutations.updateInventoryItem);
  const [isSubmitting, startTransition] = useTransition();

  const { data: part, isLoading: isLoadingPart } = useGetPart(item?.partNumber ?? null);

  const form = useForm<EditInventoryFormData>({
    resolver: zodResolver(editInventorySchema),
    defaultValues: {
      location: "",
      quantityAvailable: 0,
      quantityReserved: 0,
      condition: "new",
      colorId: "",
      price: "",
      notes: "",
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

  const { data: priceGuide } = useGetPriceGuide(item?.partNumber ?? null, colorIdNumber);

  // Image is handled by ColorPartImage component

  // Initialize form when item changes
  useEffect(() => {
    if (item && open) {
      form.reset({
        colorId: item.colorId,
        location: item.location,
        quantityAvailable: item.quantityAvailable,
        quantityReserved: item.quantityReserved || 0,
        condition: item.condition,
        price: item.price?.toString() || "",
        notes: item.notes || "",
        priceHelperType: "stock",
        priceHelperStat: "avg",
      });
    }
  }, [item, open, form]);

  // Keep price synced when user changes condition/type/stat after initialization
  useAutoPriceFromGuide({ form, priceGuide });

  const onSubmit = (data: EditInventoryFormData) => {
    if (!item) return;

    startTransition(() => {
      updateInventoryItem({
        itemId: item._id,
        colorId: data.colorId,
        location: data.location,
        quantityAvailable: data.quantityAvailable,
        quantityReserved: data.quantityReserved,
        condition: data.condition,
        price: Number(data.price),
        notes: data.notes || undefined,
        reason: "Manual edit",
      }).then(() => {
        onOpenChange(false);
      });
    });
  };

  const loading = isLoadingPart;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="overflow-y-auto h-[90vh]">
        <SheetHeader className="pb-4">
          <SheetTitle className="sr-only">Edit Inventory Item</SheetTitle>
          <SheetDescription>
            {loading
              ? "Loading part details…"
              : `${part?.name ?? "Part"} · ${part?.partNumber ?? "—"}`}
          </SheetDescription>
          {/* Image moved next to form fields below for compact layout */}
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
                {/* Compact top row with image on the left and fields on the right */}
                <div className="flex gap-4 items-start">
                  {/* Image */}
                  {part && (
                    <div className="relative h-24 w-24 flex-shrink-0">
                      <ColorPartImage
                        partNumber={item?.partNumber ?? null}
                        colorId={colorIdNumber}
                        alt={part.name}
                        fill
                        sizes="96px"
                        unoptimized
                      />
                    </div>
                  )}

                  {/* Core fields */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 flex-1">
                    <FormField<EditInventoryFormData, "colorId">
                      control={form.control}
                      name="colorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Color</FormLabel>
                          <FormControl>
                            <ColorSelect
                              partNumber={item?.partNumber ?? null}
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Select color..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField<EditInventoryFormData, "location">
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

                    <FormField<EditInventoryFormData, "condition">
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

                    <FormField<EditInventoryFormData, "quantityAvailable">
                      control={form.control}
                      name="quantityAvailable"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Available Quantity</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField<EditInventoryFormData, "quantityReserved">
                      control={form.control}
                      name="quantityReserved"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Reserved Quantity</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField<EditInventoryFormData, "price">
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
                </div>

                {/* Notes field */}
                <FormField<EditInventoryFormData, "notes">
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional notes about this inventory item..."
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Inline price guide to cross-check visually */}
                <PartPriceGuide
                  partNumber={item?.partNumber ?? null}
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
                  {isSubmitting ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
}
