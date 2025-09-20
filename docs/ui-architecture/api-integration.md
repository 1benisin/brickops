# API Integration

## Service Template

```typescript
// lib/services/inventory-service.ts - Aligned with backend InventoryService
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface InventoryApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number;
}

interface AddInventoryItemRequest {
  businessAccountId: Id<"businessAccounts">;
  partNumber: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  condition: "new" | "used";
}

interface UpdateQuantitiesRequest {
  itemId: Id<"inventoryItems">;
  availableChange?: number;
  reservedChange?: number;
  soldChange?: number;
}

interface SearchInventoryRequest {
  businessAccountId: Id<"businessAccounts">;
  filters?: {
    partNumber?: string;
    location?: string;
    status?: "available" | "sold" | "reserved";
    colorId?: string;
  };
}

export class InventoryService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: addInventoryItem(businessAccountId, partDetails, quantity, location)
  async addInventoryItem(
    request: AddInventoryItemRequest
  ): Promise<InventoryApiResponse<Id<"inventoryItems">>> {
    try {
      const itemId = await this.convex.mutation(
        api.inventory.addInventoryItem,
        request
      );
      return { success: true, data: itemId };
    } catch (error) {
      return this.handleApiError("Failed to create inventory item", error);
    }
  }

  // Matches backend: updateQuantities(itemId, availableChange, reservedChange, soldChange)
  async updateQuantities(
    request: UpdateQuantitiesRequest
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.inventory.updateQuantities, request);
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to update quantities", error);
    }
  }

  // Matches backend: searchInventory(businessAccountId, filters)
  async searchInventory(
    request: SearchInventoryRequest
  ): Promise<InventoryApiResponse<InventoryItem[]>> {
    try {
      const items = await this.convex.query(
        api.inventory.searchInventory,
        request
      );
      return { success: true, data: items };
    } catch (error) {
      return this.handleApiError("Failed to search inventory", error);
    }
  }

  // Matches backend: getInventoryByLocation(businessAccountId, location)
  async getInventoryByLocation(
    businessAccountId: Id<"businessAccounts">,
    location: string
  ): Promise<InventoryApiResponse<InventoryItem[]>> {
    try {
      const items = await this.convex.query(
        api.inventory.getInventoryByLocation,
        {
          businessAccountId,
          location,
        }
      );
      return { success: true, data: items };
    } catch (error) {
      return this.handleApiError("Failed to get inventory by location", error);
    }
  }

  // Matches backend: auditInventoryChanges(businessAccountId, dateRange)
  async getAuditHistory(
    businessAccountId: Id<"businessAccounts">,
    dateRange?: { start: number; end: number }
  ): Promise<InventoryApiResponse<InventoryAuditLog[]>> {
    try {
      const auditLog = await this.convex.query(
        api.inventory.auditInventoryChanges,
        {
          businessAccountId,
          dateRange,
        }
      );
      return { success: true, data: auditLog };
    } catch (error) {
      return this.handleApiError("Failed to get audit history", error);
    }
  }

  private handleApiError(
    operation: string,
    error: unknown
  ): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

export const inventoryService = new InventoryService();

// lib/services/part-identification-service.ts - Aligned with backend PartIdentificationService
export class PartIdentificationService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: identifyPartFromImage(imageData, businessAccountId)
  async identifyPartFromImage(
    imageFileId: Id<"_storage">,
    businessAccountId: Id<"businessAccounts">
  ): Promise<InventoryApiResponse<PartIdentificationResult>> {
    try {
      const result = await this.convex.mutation(
        api.identification.identifyPartFromImage,
        {
          imageFileId,
          businessAccountId,
        }
      );
      return { success: true, data: result };
    } catch (error) {
      return this.handleApiError("Failed to identify part", error);
    }
  }

  // Matches backend: getIdentificationResults(requestId)
  async getIdentificationResults(
    requestId: string
  ): Promise<InventoryApiResponse<PartIdentificationResult>> {
    try {
      const result = await this.convex.query(
        api.identification.getIdentificationResults,
        {
          requestId,
        }
      );
      return { success: true, data: result };
    } catch (error) {
      return this.handleApiError("Failed to get identification results", error);
    }
  }

  // Matches backend: verifyIdentification(partNumber, colorId, confirmed)
  async verifyIdentification(
    identificationId: Id<"partIdentifications">,
    partNumber: string,
    colorId: string,
    confirmed: boolean
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.identification.verifyIdentification, {
        identificationId,
        partNumber,
        colorId,
        confirmed,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to verify identification", error);
    }
  }

  private handleApiError(
    operation: string,
    error: unknown
  ): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

// lib/services/order-service.ts - Aligned with backend OrderProcessingService
export class OrderService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: processNewOrders(businessAccountId)
  async processNewOrders(
    businessAccountId: Id<"businessAccounts">
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.action(api.orders.processNewOrders, {
        businessAccountId,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to process new orders", error);
    }
  }

  // Matches backend: updateOrderStatus(orderId, newStatus)
  async updateOrderStatus(
    orderId: Id<"marketplaceOrders">,
    newStatus: "pending" | "picked" | "shipped" | "completed"
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.orders.updateOrderStatus, {
        orderId,
        newStatus,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to update order status", error);
    }
  }

  // Matches backend: generatePickSheets(orderIds)
  async generatePickSheets(
    orderIds: Array<Id<"marketplaceOrders">>
  ): Promise<InventoryApiResponse<string>> {
    try {
      const pdfUrl = await this.convex.action(api.orders.generatePickSheets, {
        orderIds,
      });
      return { success: true, data: pdfUrl };
    } catch (error) {
      return this.handleApiError("Failed to generate pick sheets", error);
    }
  }

  // Matches backend: exportOrdersToCSV(orderIds, format)
  async exportOrdersToCSV(
    orderIds: Array<Id<"marketplaceOrders">>,
    format: "standard" | "detailed"
  ): Promise<InventoryApiResponse<string>> {
    try {
      const csvUrl = await this.convex.action(api.orders.exportOrdersToCSV, {
        orderIds,
        format,
      });
      return { success: true, data: csvUrl };
    } catch (error) {
      return this.handleApiError("Failed to export orders to CSV", error);
    }
  }

  private handleApiError(
    operation: string,
    error: unknown
  ): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

// lib/services/picking-service.ts - Aligned with backend PickSessionService
export class PickingService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: createPickSession(userId, orderIds)
  async createPickSession(
    userId: Id<"users">,
    orderIds: Array<Id<"marketplaceOrders">>
  ): Promise<InventoryApiResponse<Id<"pickSessions">>> {
    try {
      const sessionId = await this.convex.mutation(
        api.picking.createPickSession,
        {
          userId,
          orderIds,
        }
      );
      return { success: true, data: sessionId };
    } catch (error) {
      return this.handleApiError("Failed to create pick session", error);
    }
  }

  // Matches backend: markPartPicked(sessionId, partNumber, quantityPicked)
  async markPartPicked(
    sessionId: Id<"pickSessions">,
    partNumber: string,
    colorId: string,
    quantityPicked: number
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.picking.markPartPicked, {
        sessionId,
        partNumber,
        colorId,
        quantityPicked,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to mark part picked", error);
    }
  }

  // Matches backend: reportPickingIssue(sessionId, partNumber, issueType, notes)
  async reportPickingIssue(
    sessionId: Id<"pickSessions">,
    partNumber: string,
    colorId: string,
    issueType:
      | "not_found"
      | "damaged"
      | "insufficient_quantity"
      | "wrong_color",
    notes?: string
  ): Promise<InventoryApiResponse<Id<"todoItems">>> {
    try {
      const todoId = await this.convex.mutation(
        api.picking.reportPickingIssue,
        {
          sessionId,
          partNumber,
          colorId,
          issueType,
          notes,
        }
      );
      return { success: true, data: todoId };
    } catch (error) {
      return this.handleApiError("Failed to report picking issue", error);
    }
  }

  // Matches backend: completePickSession(sessionId)
  async completePickSession(
    sessionId: Id<"pickSessions">
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.picking.completePickSession, {
        sessionId,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to complete pick session", error);
    }
  }

  private handleApiError(
    operation: string,
    error: unknown
  ): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

export const partIdentificationService = new PartIdentificationService();
export const orderService = new OrderService();
export const pickingService = new PickingService();
```

## API Client Configuration

```typescript
// lib/api-client.ts - Centralized API client with rate limiting
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;

  constructor(
    private rateLimit: { requestsPerMinute: number; burstLimit: number }
  ) {}

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRateLimit(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  // Additional rate limiting implementation...
}

export class ApiClient {
  private convex: ConvexHttpClient;
  private requestQueues: Record<string, RequestQueue>;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

    this.requestQueues = {
      bricklink: new RequestQueue({ requestsPerMinute: 5000, burstLimit: 10 }),
      brickowl: new RequestQueue({ requestsPerMinute: 1000, burstLimit: 5 }),
      brickognize: new RequestQueue({ requestsPerMinute: 100, burstLimit: 3 }),
    };
  }

  // API methods with rate limiting...
}
```
