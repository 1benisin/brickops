import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { categoriesReturnValidator, categoryTableFields } from "./validators";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all categories
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const getCategories = query({
  args: {},
  returns: categoriesReturnValidator,
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();

    return categories.map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      parentId: category.parentId,
      lastFetched: category.lastFetched,
    }));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Upsert category data into database
 * Internal mutation used by refresh actions and background queue processor
 */
export const upsertCategory = internalMutation({
  args: {
    data: v.object(categoryTableFields),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.data.categoryId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args.data);
    } else {
      await ctx.db.insert("categories", args.data);
    }
  },
});
