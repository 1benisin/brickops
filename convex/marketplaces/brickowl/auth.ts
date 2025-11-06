/**
 * Shared API key authentication helpers for BrickOwl API
 * Used by store client for all BrickOwl operations
 *
 * CRITICAL: All functions are pure and testable (accept API key as parameter)
 */

import { randomHex } from "../../lib/webcrypto";

/**
 * BrickOwl API key credentials structure
 */
export interface BrickOwlCredentials {
  apiKey: string;
}

/**
 * Validate BrickOwl API key format
 * BrickOwl API keys are typically 32-64 character alphanumeric strings
 * @param apiKey The API key to validate
 * @returns true if format is valid
 */
export function validateApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== "string") {
    return false;
  }

  // Trim and check length
  const trimmed = apiKey.trim();
  if (trimmed.length < 20 || trimmed.length > 128) {
    return false;
  }

  // Should be alphanumeric (may include hyphens or underscores)
  const validPattern = /^[A-Za-z0-9_-]+$/;
  return validPattern.test(trimmed);
}

/**
 * Build authentication headers for BrickOwl API requests
 * @param apiKey User's BrickOwl API key
 * @param isPostRequest Whether this is a POST request (affects content type)
 * @returns Headers object (API key is NOT in headers - it goes in query params for GET or body for POST)
 * 
 * NOTE: BrickOwl API authentication:
 * - GET requests: API key goes in query parameter `key=API_KEY`
 * - POST requests: API key goes in form-encoded body with `key=API_KEY`
 */
export function buildAuthHeaders(apiKey: string, isPostRequest: boolean = false): Record<string, string> {
  if (!validateApiKey(apiKey)) {
    throw new Error("Invalid BrickOwl API key format");
  }

  // For POST requests, use form-encoded content type
  // For GET requests, no special headers needed (key goes in query params)
  if (isPostRequest) {
    return {
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  return {};
}

/**
 * Get the API key for use in query parameters or form data
 * @param apiKey User's BrickOwl API key
 * @returns Trimmed API key
 */
export function getApiKey(apiKey: string): string {
  if (!validateApiKey(apiKey)) {
    throw new Error("Invalid BrickOwl API key format");
  }
  return apiKey.trim();
}

/**
 * Generate unique request ID for correlation and tracing
 * @returns Unique request identifier
 */
export function generateRequestId(): string {
  return `bo-${Date.now()}-${randomHex(8)}`;
}
