# Data Models

## User

**Purpose:** Represents users within the multi-tenant business account system with role-based access control

**Key Attributes:**

- id: string - Unique user identifier
- email: string - User's email address (login credential)
- businessAccountId: string - Reference to business account (tenant isolation)
- role: "owner" | "manager" | "picker" | "view-only" - User's access level
- firstName: string - User's first name
- lastName: string - User's last name
- isActive: boolean - Account status
- createdAt: number - Account creation timestamp
- lastLoginAt: number - Last login tracking

**Relationships:**

- Belongs to one BusinessAccount
- Can create/modify inventory items (based on role)
- Can initiate pick sessions (based on role)

## BusinessAccount

**Purpose:** Represents tenant isolation boundary for multi-user businesses sharing inventory and orders

**Key Attributes:**

- id: string - Unique business account identifier
- name: string - Business name
- ownerId: string - Reference to account owner user
- bricklinkCredentials: object - Encrypted API credentials
- brickowlCredentials: object - Encrypted API credentials
- subscriptionStatus: "active" | "suspended" | "trial" - Account status
- createdAt: number - Account creation timestamp

**Relationships:**

- Has many Users
- Owns all inventory items and orders
- Contains API integration settings

## LegoPartCatalog

**Purpose:** Centralized catalog database maintaining comprehensive Lego part information with intelligent caching from Bricklink API

**Key Attributes:**

- partNumber: string - Official Lego part number (primary key)
- partName: string - Part description/name
- categoryId: string - Part category classification
- imageUrl: string - Primary part image URL
- colors: array - Available color variations with color IDs
- approximatePrice: number - Current market price estimate
- lastUpdated: number - Data freshness timestamp
- source: "brickops" | "bricklink" - Data origin for cache management

**Relationships:**

- Referenced by InventoryItem for part details
- Used by PartIdentification results

## InventoryItem

**Purpose:** Tracks actual inventory quantities and locations for each business account with status management

**Key Attributes:**

- id: string - Unique inventory item identifier
- businessAccountId: string - Tenant isolation
- partNumber: string - Reference to LegoPartCatalog
- colorId: string - Specific color variant
- location: string - Physical storage location (e.g., "C303")
- quantityAvailable: number - Available for sale
- quantityReserved: number - Reserved for pending orders
- quantitySold: number - Sold but not yet picked
- condition: "new" | "used" - Part condition
- createdAt: number - Item creation timestamp
- updatedAt: number - Last modification timestamp

**Relationships:**

- Belongs to BusinessAccount
- References LegoPartCatalog for part details
- Creates InventoryAuditLog entries on changes

## MarketplaceOrder

**Purpose:** Represents orders from Bricklink and Brickowl with unified structure for order management

**Key Attributes:**

- id: string - Internal order identifier
- businessAccountId: string - Tenant isolation
- marketplaceOrderId: string - Original marketplace order ID
- marketplace: "bricklink" | "brickowl" - Source marketplace
- customerName: string - Buyer information
- customerAddress: object - Shipping address details
- orderStatus: "pending" | "picked" | "shipped" | "completed" - Processing status
- totalValue: number - Order total amount
- orderItems: array - List of parts and quantities ordered
- syncedAt: number - Last sync timestamp from marketplace
- createdAt: number - Order import timestamp

**Relationships:**

- Belongs to BusinessAccount
- Contains references to InventoryItems via orderItems
- Can be included in PickSession

## PickSession

**Purpose:** Manages the picking workflow for one or multiple orders with optimized path generation and issue tracking

**Key Attributes:**

- id: string - Unique pick session identifier
- businessAccountId: string - Tenant isolation
- pickerUserId: string - User conducting the pick
- orderIds: array - List of orders being picked in this session
- status: "active" | "paused" | "completed" - Session status
- pickPath: array - Optimized picking sequence with locations
- currentPosition: number - Progress through pick path
- issuesEncountered: array - Parts marked as problematic
- startedAt: number - Session start time
- completedAt: number - Session completion time

**Relationships:**

- Belongs to BusinessAccount
- References MarketplaceOrders being picked
- Performed by User (picker)
- Generates InventoryAdjustments and TodoItems

## TodoItem

**Purpose:** Tracks parts that couldn't be fulfilled during picking and require refunds or resolution

**Key Attributes:**

- id: string - Unique todo item identifier
- businessAccountId: string - Tenant isolation
- partNumber: string - Part that couldn't be fulfilled
- colorId: string - Specific color variant
- quantityNeeded: number - Amount that couldn't be fulfilled
- orderId: string - Original order requiring this part
- reason: "not_found" | "damaged" | "insufficient_quantity" - Issue reason
- status: "pending" | "resolved" | "refunded" - Resolution status
- notes: string - Additional details or resolution notes
- createdAt: number - Issue creation timestamp

**Relationships:**

- Belongs to BusinessAccount
- References specific MarketplaceOrder
- Generated during PickSession issues
