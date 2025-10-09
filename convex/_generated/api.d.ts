/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as actions_email from "../actions/email.js";
import type * as auth from "../auth.js";
import type * as bricklink_bricklinkClient from "../bricklink/bricklinkClient.js";
import type * as bricklink_bricklinkMappers from "../bricklink/bricklinkMappers.js";
import type * as bricklink_dataRefresher from "../bricklink/dataRefresher.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as functions_hello from "../functions/hello.js";
import type * as functions_hello_impl from "../functions/hello_impl.js";
import type * as functions_identify from "../functions/identify.js";
import type * as functions_identifyActions from "../functions/identifyActions.js";
import type * as functions_internal from "../functions/internal.js";
import type * as functions_inventory from "../functions/inventory.js";
import type * as functions_marketplace from "../functions/marketplace.js";
import type * as functions_users from "../functions/users.js";
import type * as http from "../http.js";
import type * as internal_identify from "../internal/identify.js";
import type * as lib_dbRateLimiter from "../lib/dbRateLimiter.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_external_brickognize from "../lib/external/brickognize.js";
import type * as lib_external_brickowl from "../lib/external/brickowl.js";
import type * as lib_external_circuitBreaker from "../lib/external/circuitBreaker.js";
import type * as lib_external_email from "../lib/external/email.js";
import type * as lib_external_env from "../lib/external/env.js";
import type * as lib_external_httpClient from "../lib/external/httpClient.js";
import type * as lib_external_inMemoryRateLimiter from "../lib/external/inMemoryRateLimiter.js";
import type * as lib_external_metrics from "../lib/external/metrics.js";
import type * as lib_external_rateLimiter from "../lib/external/rateLimiter.js";
import type * as lib_external_retry from "../lib/external/retry.js";
import type * as lib_external_types from "../lib/external/types.js";
import type * as lib_external_validate from "../lib/external/validate.js";
import type * as lib_rateLimiterAdapter from "../lib/rateLimiterAdapter.js";
import type * as lib_webcrypto from "../lib/webcrypto.js";
import type * as validators_catalog from "../validators/catalog.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "actions/email": typeof actions_email;
  auth: typeof auth;
  "bricklink/bricklinkClient": typeof bricklink_bricklinkClient;
  "bricklink/bricklinkMappers": typeof bricklink_bricklinkMappers;
  "bricklink/dataRefresher": typeof bricklink_dataRefresher;
  catalog: typeof catalog;
  crons: typeof crons;
  "functions/hello": typeof functions_hello;
  "functions/hello_impl": typeof functions_hello_impl;
  "functions/identify": typeof functions_identify;
  "functions/identifyActions": typeof functions_identifyActions;
  "functions/internal": typeof functions_internal;
  "functions/inventory": typeof functions_inventory;
  "functions/marketplace": typeof functions_marketplace;
  "functions/users": typeof functions_users;
  http: typeof http;
  "internal/identify": typeof internal_identify;
  "lib/dbRateLimiter": typeof lib_dbRateLimiter;
  "lib/encryption": typeof lib_encryption;
  "lib/external/brickognize": typeof lib_external_brickognize;
  "lib/external/brickowl": typeof lib_external_brickowl;
  "lib/external/circuitBreaker": typeof lib_external_circuitBreaker;
  "lib/external/email": typeof lib_external_email;
  "lib/external/env": typeof lib_external_env;
  "lib/external/httpClient": typeof lib_external_httpClient;
  "lib/external/inMemoryRateLimiter": typeof lib_external_inMemoryRateLimiter;
  "lib/external/metrics": typeof lib_external_metrics;
  "lib/external/rateLimiter": typeof lib_external_rateLimiter;
  "lib/external/retry": typeof lib_external_retry;
  "lib/external/types": typeof lib_external_types;
  "lib/external/validate": typeof lib_external_validate;
  "lib/rateLimiterAdapter": typeof lib_rateLimiterAdapter;
  "lib/webcrypto": typeof lib_webcrypto;
  "validators/catalog": typeof validators_catalog;
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
