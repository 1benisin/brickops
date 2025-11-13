import type { Doc, DataModel } from "@/convex/_generated/dataModel";
import { decodeHtmlEntities } from "../shared/transformers";

type InsertRecord<TableName extends keyof DataModel> = Omit<
  Doc<TableName>,
  "_id" | "_creationTime"
>;

export type CategoryRecord = InsertRecord<"categories">;

export function mapCategory(input: {
  category_id: number;
  category_name: string;
  parent_id?: number | null;
}): CategoryRecord {
  const now = Date.now();

  return {
    categoryId: input.category_id,
    categoryName: decodeHtmlEntities(input.category_name),
    parentId: input.parent_id && input.parent_id !== 0 ? input.parent_id : undefined,
    lastFetched: now,
    createdAt: now,
  };
}


