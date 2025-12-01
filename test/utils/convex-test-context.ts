/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";
import { ConvexError } from "convex/values";

type Identity = {
  tokenIdentifier: string;
  subject?: string;
  issuer?: string;
  name?: string;
  email?: string;
};

type TableSeed = Record<string, unknown> & {
  _id?: string;
  _creationTime?: number;
};

type SeedData = Record<string, TableSeed[]>;

type FieldRef<T> = { kind: "field"; name: keyof T & string };

type ChainableQuery<T> = {
  eq: (field: FieldInput<T>, value: unknown) => ChainableQuery<T>;
  lt: (field: FieldInput<T>, value: unknown) => ChainableQuery<T>;
  lte: (field: FieldInput<T>, value: unknown) => ChainableQuery<T>;
  gt: (field: FieldInput<T>, value: unknown) => ChainableQuery<T>;
  gte: (field: FieldInput<T>, value: unknown) => ChainableQuery<T>;
  order: (field: FieldInput<T>, direction?: "asc" | "desc") => ChainableQuery<T>;
  field: (field: keyof T & string) => FieldRef<T>;
};

type FieldInput<T> = (keyof T & string) | FieldRef<T>;

type FilterExpression<T> = {
  evaluate: (doc: T) => boolean;
};

type FilterBuilder<T> = {
  field: (name: keyof T & string) => FieldRef<T>;
  eq: (field: FieldInput<T>, value: unknown) => FilterExpression<T>;
  lt: (field: FieldInput<T>, value: unknown) => FilterExpression<T>;
  lte: (field: FieldInput<T>, value: unknown) => FilterExpression<T>;
  gt: (field: FieldInput<T>, value: unknown) => FilterExpression<T>;
  gte: (field: FieldInput<T>, value: unknown) => FilterExpression<T>;
  and: (...expressions: FilterExpression<T>[]) => FilterExpression<T>;
  or: (...expressions: FilterExpression<T>[]) => FilterExpression<T>;
  not: (expression: FilterExpression<T>) => FilterExpression<T>;
};

type QueryBuilder<T> = {
  filter: (predicate: (doc: T) => boolean) => QueryBuilder<T>;
  withIndex: (_indexName: string, handler?: (query: ChainableQuery<T>) => void) => QueryBuilder<T>;
  withSearchIndex: (
    _indexName: string,
    handler: (query: { search: (field: keyof T & string, value: string) => void }) => void,
  ) => QueryBuilder<T>;
  collect: () => Promise<T[]>;
  first: () => Promise<T | null>;
  unique: () => Promise<T | null>;
  paginate: (options: {
    cursor?: string | null;
    numItems: number;
  }) => Promise<{ page: T[]; continueCursor: string | null; isDone: boolean }>;
};

type Patch<T> = Partial<Omit<T, "_id" | "_creationTime">>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class MockDb {
  private tables: Map<string, Map<string, any>> = new Map();
  private counters: Map<string, number> = new Map();

  constructor(seed: SeedData = {}) {
    for (const [tableName, records] of Object.entries(seed)) {
      const map = new Map<string, any>();
      records.forEach((record) => {
        const id = record._id ?? this.generateId(tableName);
        const normalized = {
          ...record,
          _id: id,
          _creationTime: record._creationTime ?? Date.now(),
        };
        map.set(id, normalized);
        this.registerExistingId(tableName, id);
      });
      this.tables.set(tableName, map);
    }
  }

  private generateId(tableName: string) {
    const current = this.counters.get(tableName) ?? 0;
    const next = current + 1;
    this.counters.set(tableName, next);
    return `${tableName}:${next}`;
  }

  private registerExistingId(tableName: string, id: string) {
    const [, numeric] = id.split(":");
    const value = Number(numeric);
    if (!Number.isFinite(value)) {
      return;
    }
    const current = this.counters.get(tableName) ?? 0;
    if (value > current) {
      this.counters.set(tableName, value);
    }
  }

  private requireTable(tableName: string) {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new Map());
    }
    return this.tables.get(tableName)!;
  }

  async insert(tableName: string, value: Record<string, unknown>) {
    const table = this.requireTable(tableName);
    const id = this.generateId(tableName);
    const record = {
      ...clone(value),
      _id: id,
      _creationTime: Date.now(),
    };
    table.set(id, record);
    return id;
  }

  async get(id: string) {
    const [tableName] = id.split(":");
    const table = this.tables.get(tableName);
    if (!table) return null;
    const record = table.get(id);
    return record ? clone(record) : null;
  }

  async patch<T extends Record<string, unknown>>(id: string, updates: Patch<T>) {
    const [tableName] = id.split(":");
    const table = this.tables.get(tableName);
    if (!table || !table.has(id)) {
      throw new ConvexError(`Document with id ${id} not found`);
    }
    const current = table.get(id)!;
    // Apply updates explicitly so `undefined` values overwrite existing fields
    const next: Record<string, unknown> = { ...current };
    for (const key of Object.keys(updates)) {
      (next as any)[key] = (updates as any)[key];
    }
    table.set(id, next);
  }

  async delete(id: string) {
    const [tableName] = id.split(":");
    const table = this.tables.get(tableName);
    table?.delete(id);
  }

  query<T = any>(tableName: string): QueryBuilder<T> {
    const table = this.tables.get(tableName);
    let records = table ? Array.from(table.values()).map((record) => clone(record)) : [];

    const builder: QueryBuilder<T> = {
      filter: (predicate) => {
        const filterBuilder = createFilterBuilder<T>();
        let expression: FilterExpression<T> | undefined;

        try {
          const result = predicate(filterBuilder as any);
          if (isFilterExpression(result)) {
            expression = result;
          }
        } catch {
          // Swallow errors here; we'll fall back to legacy predicate evaluation below.
        }

        if (expression) {
          records = records.filter((doc) => expression!.evaluate(doc as T));
        } else {
          records = records.filter((doc) => (predicate as any)(doc as T));
        }

        return builder;
      },
      withIndex: (_indexName, handler) => {
        if (handler) {
          const constraints: FilterExpression<T>[] = [];
          const ordering: Array<{ field: keyof T & string; direction: "asc" | "desc" }> = [];

          const chainable: ChainableQuery<T> = {
            field: (name) => ({ kind: "field", name }),
            eq: (field, value) => {
              constraints.push(createComparisonExpression(field, value, "eq"));
              return chainable;
            },
            lt: (field, value) => {
              constraints.push(createComparisonExpression(field, value, "lt"));
              return chainable;
            },
            lte: (field, value) => {
              constraints.push(createComparisonExpression(field, value, "lte"));
              return chainable;
            },
            gt: (field, value) => {
              constraints.push(createComparisonExpression(field, value, "gt"));
              return chainable;
            },
            gte: (field, value) => {
              constraints.push(createComparisonExpression(field, value, "gte"));
              return chainable;
            },
            order: (field, direction = "asc") => {
              ordering.push({ field: resolveField(field), direction });
              return chainable;
            },
          };

          handler(chainable);

          if (constraints.length > 0) {
            records = records.filter((doc) =>
              constraints.every((expression) => expression.evaluate(doc as T)),
            );
          }

          if (ordering.length > 0) {
            records = [...records].sort((a, b) => {
              for (const { field, direction } of ordering) {
                const aValue = (a as any)[field];
                const bValue = (b as any)[field];
                if (aValue === bValue) {
                  continue;
                }
                if (aValue === undefined || aValue === null) {
                  return direction === "asc" ? 1 : -1;
                }
                if (bValue === undefined || bValue === null) {
                  return direction === "asc" ? -1 : 1;
                }
                if (aValue < bValue) {
                  return direction === "asc" ? -1 : 1;
                }
                if (aValue > bValue) {
                  return direction === "asc" ? 1 : -1;
                }
              }
              return 0;
            });
          }
        }
        return builder;
      },
      withSearchIndex: (_indexName, handler) => {
        handler({
          search: (field, value) => {
            const searchTerm = value.toLowerCase();
            records = records.filter((doc) => {
              const fieldValue = (doc as any)[field];
              if (typeof fieldValue === "string") {
                return fieldValue.toLowerCase().includes(searchTerm);
              }
              if (Array.isArray(fieldValue)) {
                return fieldValue.some((item) => String(item).toLowerCase().includes(searchTerm));
              }
              return false;
            });
          },
        });
        return builder;
      },
      collect: async () => records as T[],
      first: async () => (records.length > 0 ? (records[0] as T) : null),
      unique: async () => {
        if (records.length === 0) {
          return null;
        }

        if (records.length > 1) {
          throw new ConvexError("Expected unique result but found multiple");
        }

        return records[0] as T;
      },
      paginate: async ({ cursor, numItems }) => {
        const startIndex = cursor ? parseInt(cursor, 10) : 0;
        const page = records.slice(startIndex, startIndex + numItems);
        const continueCursor =
          startIndex + numItems < records.length ? (startIndex + numItems).toString() : null;
        const isDone = startIndex + numItems >= records.length;
        return { page: page as T[], continueCursor, isDone };
      },
    };

    return builder;
  }
}

function createFilterBuilder<T>(): FilterBuilder<T> {
  return {
    field: (name) => ({ kind: "field", name }),
    eq: (field, value) => createComparisonExpression(field, value, "eq"),
    lt: (field, value) => createComparisonExpression(field, value, "lt"),
    lte: (field, value) => createComparisonExpression(field, value, "lte"),
    gt: (field, value) => createComparisonExpression(field, value, "gt"),
    gte: (field, value) => createComparisonExpression(field, value, "gte"),
    and: (...expressions) => ({
      evaluate: (doc) => expressions.every((expression) => expression.evaluate(doc)),
    }),
    or: (...expressions) => ({
      evaluate: (doc) => expressions.some((expression) => expression.evaluate(doc)),
    }),
    not: (expression) => ({
      evaluate: (doc) => !expression.evaluate(doc),
    }),
  };
}

function isFilterExpression<T>(value: unknown): value is FilterExpression<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "evaluate" in value &&
    typeof (value as FilterExpression<T>).evaluate === "function"
  );
}

type ComparisonKind = "eq" | "lt" | "lte" | "gt" | "gte";

function createComparisonExpression<T>(
  field: FieldInput<T>,
  value: unknown,
  kind: ComparisonKind,
): FilterExpression<T> {
  const fieldName = resolveField(field);
  return {
    evaluate: (doc: T) => {
      const left = (doc as any)[fieldName];
      switch (kind) {
        case "eq":
          return left === value;
        case "lt":
          return left < (value as any);
        case "lte":
          return left <= (value as any);
        case "gt":
          return left > (value as any);
        case "gte":
          return left >= (value as any);
        default:
          return false;
      }
    },
  };
}

function resolveField<T>(field: FieldInput<T>): keyof T & string {
  return typeof field === "string" ? field : field.name;
}

export interface ConvexTestContextOptions {
  seed?: SeedData;
  identity?: Identity | null;
}

export interface ConvexTestContext {
  db: MockDb;
  auth: {
    getUserIdentity: () => Promise<Identity | null>;
  };
  scheduler: {
    runAfter: ReturnType<typeof vi.fn>;
    runAt: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

export const createConvexTestContext = (
  options: ConvexTestContextOptions = {},
): ConvexTestContext => {
  const db = new MockDb(options.seed);
  const identity = options.identity ?? null;

  return {
    db,
    auth: {
      getUserIdentity: async () => identity,
    },
    scheduler: {
      runAfter: vi.fn().mockResolvedValue(undefined),
      runAt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
  };
};

export type BusinessAccountSeed = {
  _id?: string;
  _creationTime?: number;
  name: string;
  ownerUserId?: string;
  inviteCode?: string;
  createdAt?: number;
};

export type UserSeed = {
  _id?: string;
  _creationTime?: number;
  businessAccountId: string;
  email: string;
  name?: string;
  role?: "owner" | "manager" | "picker" | "viewer";
  status?: "active" | "invited";
  firstName?: string;
  lastName?: string;
  createdAt?: number;
  updatedAt?: number;
};

type InventorySeed = {
  businessAccountId: string;
  sku: string;
  name: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  condition: "new" | "used";
  createdBy: string;
  createdAt?: number;
};

type CatalogPartOverlaySeed = {
  _id?: string;
  _creationTime?: number;
  businessAccountId: string;
  partNumber: string;
  tags?: string[];
  notes?: string;
  sortLocation?: string;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
};

type LegoPartCatalogSeed = {
  _id?: string;
  _creationTime?: number;
  partNumber: string;
  name: string;
  description?: string;
  category?: string;
  categoryPath?: number[];
  categoryPathKey?: string;
  imageUrl?: string;
  bricklinkPartId?: string;
  bricklinkCategoryId?: number;
  searchKeywords: string;
  primaryColorId?: number;
  availableColorIds?: number[];
  sortLocation?: string;
  marketPrice?: number;
  marketPriceCurrency?: string;
  marketPriceLastSyncedAt?: number;
  dataSource: "brickops" | "bricklink" | "manual";
  lastUpdated: number;
  lastFetchedFromBricklink?: number;
  dataFreshness: "fresh" | "stale" | "expired";
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  aliases?: string[];
};

export const buildSeedData = (seed: {
  businessAccounts?: BusinessAccountSeed[];
  users?: UserSeed[];
  inventoryItems?: InventorySeed[];
  parts?: LegoPartCatalogSeed[];
  catalogPartOverlay?: CatalogPartOverlaySeed[];
  bricklinkColorReference?: TableSeed[];
  bricklinkCategoryReference?: TableSeed[];
  bricklinkPartColorAvailability?: TableSeed[];
  bricklinkElementReference?: TableSeed[];
}) => seed as SeedData;

export const createTestIdentity = (overrides: Partial<Identity> = {}): Identity => ({
  tokenIdentifier: overrides.tokenIdentifier ?? "test-token",
  subject: overrides.subject ?? "user-123",
  issuer: overrides.issuer ?? "https://example.com",
  ...overrides,
});
