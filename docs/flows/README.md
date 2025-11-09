# User Flows Documentation

This directory contains simple, compact flow documentation for key user workflows in BrickOps.

## Flow Documentation Format

Each flow document follows this simple format:

```
Flow Name

User Action / System Action - Description
Next Action - Description
...
```

## Flow Categories

### Orders

- [Order Picking](./order-picking.md) - Selecting orders and picking items
- [New Bricklink Order Notification](./bricklink-order-notification.md) - Receiving and processing new orders
- [Print Packaging Slips](./print-packaging-slips.md) - Generating packaging slips for orders
- [Order Status Update](./order-status-update.md) - Auto-updating order status when fully picked

### Inventory

- [Add Inventory Item](./inventory-add.md) - Adding new items to inventory
- [Edit Inventory Item](./inventory-edit.md) - Editing existing inventory items
- [Inventory File Upload](./inventory-file-upload.md) - Batch upload via file
- [Inventory History View](./inventory-history.md) - Viewing inventory change history

### Identification

- [Part Identification](./part-identification.md) - Identifying parts via camera/Brickognize

### Marketplace Sync

- [Inventory to Marketplace Sync](./inventory-sync.md) - Syncing inventory changes to marketplaces

### Catalog

- [Part Catalog Lookup](./part-catalog-lookup.md) - Searching and viewing part catalog
- [Catalog Stale/Missing Data Refresh](./catalog-stale-data-refresh.md) - Automatic refresh of stale or missing part data

### Background Processes

- [Order Sync from Marketplaces](./order-sync-from-marketplaces.md) - Periodic order sync via cron
- [Bricklink Notification Polling](./bricklink-notification-polling.md) - Polling notifications as safety net

## Implementation Status

See [flows-implementation-plan.md](./flows-implementation-plan.md) for the complete list of flows and their documentation status.
