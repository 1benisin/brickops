/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as catalog_actions from "../catalog/actions.js";
import type * as catalog_helpers from "../catalog/helpers.js";
import type * as catalog_mutations from "../catalog/mutations.js";
import type * as catalog_queries from "../catalog/queries.js";
import type * as catalog_refreshWorker from "../catalog/refreshWorker.js";
import type * as catalog_validators from "../catalog/validators.js";
import type * as crons from "../crons.js";
import type * as hello from "../hello.js";
import type * as hello_impl from "../hello_impl.js";
import type * as http from "../http.js";
import type * as identify_actions from "../identify/actions.js";
import type * as identify_helpers from "../identify/helpers.js";
import type * as identify_mutations from "../identify/mutations.js";
import type * as inventory_helpers from "../inventory/helpers.js";
import type * as inventory_mutations from "../inventory/mutations.js";
import type * as inventory_queries from "../inventory/queries.js";
import type * as inventory_sync from "../inventory/sync.js";
import type * as inventory_syncWorker from "../inventory/syncWorker.js";
import type * as inventory_testInventory from "../inventory/testInventory.js";
import type * as inventory_types from "../inventory/types.js";
import type * as inventory_validators from "../inventory/validators.js";
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
import type * as marketplace_actions from "../marketplace/actions.js";
import type * as marketplace_mutations from "../marketplace/mutations.js";
import type * as marketplace_queries from "../marketplace/queries.js";
import type * as marketplaces_bricklink_bricklinkMappers from "../marketplaces/bricklink/bricklinkMappers.js";
import type * as marketplaces_bricklink_catalogClient from "../marketplaces/bricklink/catalogClient.js";
import type * as marketplaces_bricklink_dataRefresher from "../marketplaces/bricklink/dataRefresher.js";
import type * as marketplaces_bricklink_notifications from "../marketplaces/bricklink/notifications.js";
import type * as marketplaces_bricklink_oauth from "../marketplaces/bricklink/oauth.js";
import type * as marketplaces_bricklink_storeClient from "../marketplaces/bricklink/storeClient.js";
import type * as marketplaces_bricklink_storeMappers from "../marketplaces/bricklink/storeMappers.js";
import type * as marketplaces_bricklink_testWebhooks from "../marketplaces/bricklink/testWebhooks.js";
import type * as marketplaces_bricklink_webhook from "../marketplaces/bricklink/webhook.js";
import type * as marketplaces_brickowl_auth from "../marketplaces/brickowl/auth.js";
import type * as marketplaces_brickowl_storeClient from "../marketplaces/brickowl/storeClient.js";
import type * as marketplaces_brickowl_storeMappers from "../marketplaces/brickowl/storeMappers.js";
import type * as marketplaces_shared_actions from "../marketplaces/shared/actions.js";
import type * as marketplaces_shared_helpers from "../marketplaces/shared/helpers.js";
import type * as marketplaces_shared_migrations from "../marketplaces/shared/migrations.js";
import type * as marketplaces_shared_mutations from "../marketplaces/shared/mutations.js";
import type * as marketplaces_shared_queries from "../marketplaces/shared/queries.js";
import type * as marketplaces_shared_rateLimitConfig from "../marketplaces/shared/rateLimitConfig.js";
import type * as marketplaces_shared_types from "../marketplaces/shared/types.js";
import type * as orders_ingestion from "../orders/ingestion.js";
import type * as orders_mocks from "../orders/mocks.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_queries from "../orders/queries.js";
import type * as ratelimit_mutations from "../ratelimit/mutations.js";
import type * as ratelimit_rateLimitConfig from "../ratelimit/rateLimitConfig.js";
import type * as users_actions from "../users/actions.js";
import type * as users_helpers from "../users/helpers.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "catalog/actions": typeof catalog_actions;
  "catalog/helpers": typeof catalog_helpers;
  "catalog/mutations": typeof catalog_mutations;
  "catalog/queries": typeof catalog_queries;
  "catalog/refreshWorker": typeof catalog_refreshWorker;
  "catalog/validators": typeof catalog_validators;
  crons: typeof crons;
  hello: typeof hello;
  hello_impl: typeof hello_impl;
  http: typeof http;
  "identify/actions": typeof identify_actions;
  "identify/helpers": typeof identify_helpers;
  "identify/mutations": typeof identify_mutations;
  "inventory/helpers": typeof inventory_helpers;
  "inventory/mutations": typeof inventory_mutations;
  "inventory/queries": typeof inventory_queries;
  "inventory/sync": typeof inventory_sync;
  "inventory/syncWorker": typeof inventory_syncWorker;
  "inventory/testInventory": typeof inventory_testInventory;
  "inventory/types": typeof inventory_types;
  "inventory/validators": typeof inventory_validators;
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
  "marketplace/actions": typeof marketplace_actions;
  "marketplace/mutations": typeof marketplace_mutations;
  "marketplace/queries": typeof marketplace_queries;
  "marketplaces/bricklink/bricklinkMappers": typeof marketplaces_bricklink_bricklinkMappers;
  "marketplaces/bricklink/catalogClient": typeof marketplaces_bricklink_catalogClient;
  "marketplaces/bricklink/dataRefresher": typeof marketplaces_bricklink_dataRefresher;
  "marketplaces/bricklink/notifications": typeof marketplaces_bricklink_notifications;
  "marketplaces/bricklink/oauth": typeof marketplaces_bricklink_oauth;
  "marketplaces/bricklink/storeClient": typeof marketplaces_bricklink_storeClient;
  "marketplaces/bricklink/storeMappers": typeof marketplaces_bricklink_storeMappers;
  "marketplaces/bricklink/testWebhooks": typeof marketplaces_bricklink_testWebhooks;
  "marketplaces/bricklink/webhook": typeof marketplaces_bricklink_webhook;
  "marketplaces/brickowl/auth": typeof marketplaces_brickowl_auth;
  "marketplaces/brickowl/storeClient": typeof marketplaces_brickowl_storeClient;
  "marketplaces/brickowl/storeMappers": typeof marketplaces_brickowl_storeMappers;
  "marketplaces/shared/actions": typeof marketplaces_shared_actions;
  "marketplaces/shared/helpers": typeof marketplaces_shared_helpers;
  "marketplaces/shared/migrations": typeof marketplaces_shared_migrations;
  "marketplaces/shared/mutations": typeof marketplaces_shared_mutations;
  "marketplaces/shared/queries": typeof marketplaces_shared_queries;
  "marketplaces/shared/rateLimitConfig": typeof marketplaces_shared_rateLimitConfig;
  "marketplaces/shared/types": typeof marketplaces_shared_types;
  "orders/ingestion": typeof orders_ingestion;
  "orders/mocks": typeof orders_mocks;
  "orders/mutations": typeof orders_mutations;
  "orders/queries": typeof orders_queries;
  "ratelimit/mutations": typeof ratelimit_mutations;
  "ratelimit/rateLimitConfig": typeof ratelimit_rateLimitConfig;
  "users/actions": typeof users_actions;
  "users/helpers": typeof users_helpers;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
