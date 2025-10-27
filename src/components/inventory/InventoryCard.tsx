import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InventoryItem, ItemCondition } from "@/types/inventory";

export interface InventoryCardProps {
  item: InventoryItem;
  onSelect?: (itemId: string) => void;
}

const conditionLabel: Record<ItemCondition, string> = {
  new: "New",
  used: "Used",
};

export const InventoryCard = ({ item, onSelect }: InventoryCardProps) => {
  return (
    <Card
      data-testid="inventory-card"
      role="button"
      className="cursor-pointer space-y-3"
      onClick={() => onSelect?.(item._id)}
    >
      <CardHeader className="space-y-1">
        <CardTitle data-testid="inventory-part-number" className="text-xl font-semibold">
          {item.partNumber}
        </CardTitle>
        <CardDescription data-testid="inventory-location">
          Location: {item.location}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <dt className="text-muted-foreground uppercase tracking-wide">Quantity</dt>
            <dd data-testid="inventory-quantity" className="font-medium">
              {item.quantityAvailable}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground uppercase tracking-wide">Condition</dt>
            <dd data-testid="inventory-condition" className="font-medium">
              {conditionLabel[item.condition]}
            </dd>
          </div>
        </dl>
        <div className="mt-4 text-sm text-muted-foreground" data-testid="inventory-color">
          Color ID: {item.colorId}
        </div>
      </CardContent>
    </Card>
  );
};
