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

type ChainableQuery<T> = {
  eq: (field: keyof T & string, value: unknown) => ChainableQuery<T>;
};

type QueryBuilder<T> = {
  filter: (predicate: (doc: T) => boolean) => QueryBuilder<T>;
  withIndex: (_indexName: string, handler?: (query: ChainableQuery<T>) => void) => QueryBuilder<T>;
  collect: () => Promise<T[]>;
  first: () => Promise<T | null>;
  unique: () => Promise<T | null>;
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
        records = records.filter((doc) => predicate(doc as T));
        return builder;
      },
      withIndex: (_indexName, handler) => {
        if (handler) {
          // Create a chainable query object that supports multiple .eq() calls
          const createChainableQuery = (): ChainableQuery<T> => ({
            eq: (field: keyof T & string, value: unknown) => {
              records = records.filter((doc) => (doc as Record<string, unknown>)[field] === value);
              return createChainableQuery();
            },
          });

          handler(createChainableQuery());
        }
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
    };

    return builder;
  }
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

type BusinessAccountSeed = {
  _id?: string;
  _creationTime?: number;
  name: string;
  ownerUserId?: string;
  inviteCode?: string;
  createdAt?: number;
};

type UserSeed = {
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

type LegoPartCatalogSeed = {
  businessAccountId: string;
  partNumber: string;
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  bricklinkPartId?: string;
  bricklinkCategoryId?: number;
  dataSource: "brickops" | "bricklink" | "manual";
  lastUpdated: number;
  lastFetchedFromBricklink?: number;
  dataFreshness: "fresh" | "stale" | "expired";
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
};

export const buildSeedData = (seed: {
  businessAccounts?: BusinessAccountSeed[];
  users?: UserSeed[];
  inventoryItems?: InventorySeed[];
  legoPartCatalog?: LegoPartCatalogSeed[];
}) => seed as SeedData;

export const createTestIdentity = (overrides: Partial<Identity> = {}): Identity => ({
  tokenIdentifier: overrides.tokenIdentifier ?? "test-token",
  subject: overrides.subject ?? "user-123",
  issuer: overrides.issuer ?? "https://example.com",
  ...overrides,
});
