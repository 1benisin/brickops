import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import type { ImportSummary } from "@/convex/inventory/validators";

interface DevelopmentTabProps {
  // BrickLink Import
  isImportingBricklink: boolean;
  bricklinkImportError: string | null;
  bricklinkImportResult: ImportSummary | null;
  onImportBricklink: () => void;

  // Mock Order
  mockOrderMarketplace: "bricklink" | "brickowl";
  setMockOrderMarketplace: (value: "bricklink" | "brickowl") => void;
  mockWebhookQuantity: number;
  setMockWebhookQuantity: (value: number) => void;
  isTriggeringMockWebhook: boolean;
  mockMarketplaceLabel: string;
  onTriggerMockOrder: () => void;

  // Delete Orders
  isDeletingOrders: boolean;
  onDeleteAllOrdersClick: () => void;

  // Mock Inventory
  mockInventoryCount: number;
  setMockInventoryCount: (value: number) => void;
  isGeneratingInventory: boolean;
  onGenerateMockInventory: () => void;

  // Delete Inventory
  isDeletingInventory: boolean;
  onDeleteAllInventoryClick: () => void;

  // Status Messages
  devMessage: { type: "success" | "error"; text: string } | null;
}

export function DevelopmentTab({
  isImportingBricklink,
  bricklinkImportError,
  bricklinkImportResult,
  onImportBricklink,
  mockOrderMarketplace,
  setMockOrderMarketplace,
  mockWebhookQuantity,
  setMockWebhookQuantity,
  isTriggeringMockWebhook,
  mockMarketplaceLabel,
  onTriggerMockOrder,
  isDeletingOrders,
  onDeleteAllOrdersClick,
  mockInventoryCount,
  setMockInventoryCount,
  isGeneratingInventory,
  onGenerateMockInventory,
  isDeletingInventory,
  onDeleteAllInventoryClick,
  devMessage,
}: DevelopmentTabProps) {
  return (
    <section className="rounded-lg border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Development Tools</h2>
        <p className="text-sm text-muted-foreground">
          Tools for testing and development. Only available in development environments.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {/* BrickLink Inventory Import */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">BrickLink Inventory Import</h3>
          <p className="text-xs text-muted-foreground">
            Import your BrickLink store inventory into BrickOps before enabling automatic sync.
          </p>
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">BrickLink</h4>
              <p className="text-xs text-muted-foreground">
                Import active BrickLink store inventory as new BrickOps items.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onImportBricklink} disabled={isImportingBricklink}>
                {isImportingBricklink ? "Importing..." : "Import All Lots"}
              </Button>
            </div>
            {bricklinkImportError ? (
              <p className="text-xs text-destructive">{bricklinkImportError}</p>
            ) : null}
            {bricklinkImportResult ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Successfully imported {bricklinkImportResult.imported} of{" "}
                  {bricklinkImportResult.total} lots.
                </p>
                {bricklinkImportResult.errors.length > 0 ? (
                  <div>
                    <p className="font-semibold text-destructive">
                      {bricklinkImportResult.errors.length} errors
                    </p>
                    <ul className="mt-1 space-y-1 text-destructive">
                      {bricklinkImportResult.errors.slice(0, 5).map((error) => (
                        <li key={error.identifier} className="truncate">
                          {error.identifier}: {error.message}
                        </li>
                      ))}
                    </ul>
                    {bricklinkImportResult.errors.length > 5 ? (
                      <p className="text-muted-foreground">Showing the first 5 errors.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Trigger Mock Marketplace Order */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Mock Marketplace Order</h3>
          <p className="text-xs text-muted-foreground">
            Simulate marketplace order ingestion using your mock inventory. Choose BrickLink or
            BrickOwl to test end-to-end order handling without hitting real APIs.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={mockOrderMarketplace}
              onValueChange={(value: "bricklink" | "brickowl") => setMockOrderMarketplace(value)}
            >
              <SelectTrigger className="w-40" data-testid="mock-order-marketplace-select">
                <SelectValue placeholder="Select marketplace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bricklink">BrickLink</SelectItem>
                <SelectItem value="brickowl">BrickOwl</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="1"
              max="100"
              value={mockWebhookQuantity}
              onChange={(e) => setMockWebhookQuantity(parseInt(e.target.value) || 1)}
              className="w-24"
              data-testid="mock-webhook-quantity-input"
            />
            <Button
              type="button"
              onClick={onTriggerMockOrder}
              disabled={isTriggeringMockWebhook}
              data-testid="trigger-mock-webhook-button"
            >
              {isTriggeringMockWebhook
                ? "Processing..."
                : `Trigger Mock ${mockMarketplaceLabel} Order`}
            </Button>
          </div>
        </div>

        {/* Delete All Orders */}
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium text-destructive">Delete All Orders</h3>
          <p className="text-xs text-muted-foreground">
            Permanently delete all Bricklink orders and order items for this business account. This
            action cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={onDeleteAllOrdersClick}
            disabled={isDeletingOrders}
            data-testid="delete-all-orders-button"
          >
            {isDeletingOrders ? "Deleting..." : "Delete All Orders"}
          </Button>
        </div>

        {/* Mock Inventory Generation */}
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium text-foreground">Mock Inventory</h3>
          <p className="text-xs text-muted-foreground">
            Generate mock inventory items using random parts and colors from your catalog. Items
            will have random locations (A1-Z9), quantities (1-100), and prices ($0.01-$10.00).
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="100"
              value={mockInventoryCount}
              onChange={(e) => setMockInventoryCount(parseInt(e.target.value) || 30)}
              className="w-24"
              data-testid="mock-inventory-count-input"
            />
            <Button
              type="button"
              onClick={onGenerateMockInventory}
              disabled={isGeneratingInventory}
              data-testid="generate-mock-inventory-button"
            >
              {isGeneratingInventory ? "Generating..." : "Generate Mock Inventory"}
            </Button>
          </div>
        </div>

        {/* Delete All Inventory */}
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium text-destructive">Delete All Inventory</h3>
          <p className="text-xs text-muted-foreground">
            Permanently delete all inventory items and ledger entries for this business account.
            This action cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={onDeleteAllInventoryClick}
            disabled={isDeletingInventory}
            data-testid="delete-all-inventory-button"
          >
            {isDeletingInventory ? "Deleting..." : "Delete All Inventory"}
          </Button>
        </div>

        {/* Status Messages */}
        {devMessage && (
          <div
            className={`mt-4 rounded-md p-3 text-sm ${
              devMessage.type === "success"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
            data-testid="dev-message"
          >
            {devMessage.text}
          </div>
        )}
      </div>
    </section>
  );
}
