/**
 * Schema for identify module
 *
 * Currently empty - identification is stateless. The module calls the
 * Brickognize API and returns results directly without persistence.
 *
 * Note: bricklinkElementReference table was moved to catalog/schema.ts
 * as it contains catalog reference data (element ID to part number mapping).
 *
 * Future: Could add identificationSessions table for tracking/analytics
 * if history or usage metrics become needed.
 */
export const identifyTables = {};
