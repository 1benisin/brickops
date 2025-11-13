# Core Workflows

These diagrams show how the Next.js frontend coordinates with Convex domains and external providers for the most important user journeys. Each step references the current UI routes and backend modules so you can trace behaviour directly in the codebase.

## Order Sync & Management

```mermaid
sequenceDiagram
    participant User as User (Orders UI)
    participant Next as Next.js Orders Route (`src/app/(authenticated)/orders`)
    participant Sync as Convex Marketplace Sync (`convex/marketplaces/*/orders/actions.ts`)
    participant Orders as Convex Orders Domain (`convex/orders/*.ts`)
    participant Inventory as Convex Inventory Domain
    participant Bricklink as Bricklink API
    participant Brickowl as BrickOwl API
    participant DB as Convex Database

    Note over Sync: Scheduled via `convex/crons.ts`
    Sync->>Bricklink: Fetch updated orders (OAuth 1.0a)
    Bricklink-->>Sync: Order payloads
    Sync->>Brickowl: Fetch updated orders (API key)
    Brickowl-->>Sync: Order payloads
    Sync->>Orders: `upsert` mutations per provider
    Sync->>Inventory: Reserve quantities for new orders
    Orders->>DB: Persist marketplace + normalized orders

    User->>Next: Open orders page / change filters
    Next->>Orders: `listOrders` query (server-driven filters)
    Orders-->>Next: Paginated order results + status
    Next-->>User: Render order table with live updates

    User->>Next: Mark order as picked / update status
    Next->>Orders: `updateOrderStatus` mutation
    Orders->>Sync: Invoke provider-specific action (if needed)
    Sync->>Bricklink: Update order status
    Sync->>Brickowl: Update order status
    Orders->>DB: Persist local status change
    DB-->>Next: Real-time subscription emits update
```

## Part Identification & Inventory Addition

```mermaid
sequenceDiagram
    participant User as User (Identify UI)
    participant Next as Next.js Identify Route (`src/app/(authenticated)/identify`)
    participant Identify as Convex Identify Actions (`convex/identify/actions.ts`)
    participant Catalog as Convex Catalog Domain (`convex/catalog/*.ts`)
    participant Inventory as Convex Inventory Mutations (`convex/inventory/mutations.ts`)
    participant Brickognize as Brickognize API
    participant DB as Convex Database
    participant Files as Convex File Storage

    User->>Next: Capture photo / upload part image
    Next->>Files: Upload image (Convex storage)
    Files-->>Next: Image URL

    Next->>Identify: `requestIdentification` action (image URL)
    Identify->>Brickognize: POST /identify
    Brickognize-->>Identify: Candidate parts + confidence
    Identify->>Catalog: `getPartDetails` / `searchParts` for validation
    Catalog-->>Identify: Part metadata (local cache or external refresh)
    Identify-->>Next: Candidate list + confidence

    User->>Next: Confirm part & enter quantity/location
    Next->>Inventory: `addInventoryItem` mutation
    Inventory->>DB: Persist inventory lot and history entry
    DB-->>Next: Subscription returns updated inventory state
    Next-->>User: Confirmation + link back to inventory grid
```

## Pick Session Lifecycle

```mermaid
sequenceDiagram
    participant Picker as Picker (Picking UI)
    participant Next as Next.js Picking Route (`src/app/(authenticated)/picking`)
    participant Orders as Convex Orders Domain
    participant Inventory as Convex Inventory Domain
    participant Pick as Convex Picking Helpers (`convex/orders/*` & `convex/inventory/*`)
    participant DB as Convex Database

    Picker->>Next: Start pick session with selected orders
    Next->>Orders: `createPickSession` mutation
    Orders->>Pick: Generate optimized pick path & queue
    Pick->>DB: Persist session + task list
    DB-->>Next: Session snapshot (subscription)

    loop For each pick task
        Next-->>Picker: Show item card (location, quantity, image)
        alt Item picked successfully
            Picker->>Next: Confirm pick
            Next->>Inventory: `markLotPicked` mutation (adjust available/sold)
            Inventory->>DB: Persist quantity change & history
        else Issue reported
            Picker->>Next: Report issue / shortage
            Next->>Orders: `reportPickIssue` mutation
            Orders->>Pick: Record todo & reroute remaining tasks
        end
        DB-->>Next: Updated session & inventory state
    end

    Picker->>Next: Complete session
    Next->>Orders: `completePickSession` mutation
    Orders->>DB: Mark associated orders as picked
    DB-->>Next: Emit completion event for UI + dashboards
```

Use these flows alongside the architecture diagrams to trace concrete file locations (`src/app/...`, `src/components/...`, `convex/...`) when adding new behaviour or debugging existing features.
