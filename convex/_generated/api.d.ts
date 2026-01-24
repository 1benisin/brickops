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
import type * as catalog_categories from "../catalog/categories.js";
import type * as catalog_colors from "../catalog/colors.js";
import type * as catalog_ensure from "../catalog/ensure.js";
import type * as catalog_helpers from "../catalog/helpers.js";
import type * as catalog_mutations from "../catalog/mutations.js";
import type * as catalog_parts from "../catalog/parts.js";
import type * as catalog_prices from "../catalog/prices.js";
import type * as catalog_rebrickable from "../catalog/rebrickable.js";
import type * as catalog_validators from "../catalog/validators.js";
import type * as crons from "../crons.js";
import type * as hello from "../hello.js";
import type * as hello_impl from "../hello_impl.js";
import type * as http from "../http.js";
import type * as identify_actions from "../identify/actions.js";
import type * as identify_client from "../identify/client.js";
import type * as identify_helpers from "../identify/helpers.js";
import type * as identify_mutations from "../identify/mutations.js";
import type * as inventory_actions from "../inventory/actions.js";
import type * as inventory_helpers from "../inventory/helpers.js";
import type * as inventory_import from "../inventory/import.js";
import type * as inventory_mocks from "../inventory/mocks.js";
import type * as inventory_mutations from "../inventory/mutations.js";
import type * as inventory_queries from "../inventory/queries.js";
import type * as inventory_sync from "../inventory/sync.js";
import type * as inventory_syncWorker from "../inventory/syncWorker.js";
import type * as inventory_types from "../inventory/types.js";
import type * as inventory_validators from "../inventory/validators.js";
import type * as lib_external_validate from "../lib/external/validate.js";
import type * as marketplaces_bricklink_catalog_categories_actions from "../marketplaces/bricklink/catalog/categories/actions.js";
import type * as marketplaces_bricklink_catalog_categories_transformers from "../marketplaces/bricklink/catalog/categories/transformers.js";
import type * as marketplaces_bricklink_catalog_colors_actions from "../marketplaces/bricklink/catalog/colors/actions.js";
import type * as marketplaces_bricklink_catalog_colors_transformers from "../marketplaces/bricklink/catalog/colors/transformers.js";
import type * as marketplaces_bricklink_catalog_parts_actions from "../marketplaces/bricklink/catalog/parts/actions.js";
import type * as marketplaces_bricklink_catalog_parts_transformers from "../marketplaces/bricklink/catalog/parts/transformers.js";
import type * as marketplaces_bricklink_catalog_priceGuides_actions from "../marketplaces/bricklink/catalog/priceGuides/actions.js";
import type * as marketplaces_bricklink_catalog_priceGuides_transformers from "../marketplaces/bricklink/catalog/priceGuides/transformers.js";
import type * as marketplaces_bricklink_catalog_refresh from "../marketplaces/bricklink/catalog/refresh.js";
import type * as marketplaces_bricklink_catalog_shared_health from "../marketplaces/bricklink/catalog/shared/health.js";
import type * as marketplaces_bricklink_catalog_shared_request from "../marketplaces/bricklink/catalog/shared/request.js";
import type * as marketplaces_bricklink_catalog_shared_transformers from "../marketplaces/bricklink/catalog/shared/transformers.js";
import type * as marketplaces_bricklink_credentials from "../marketplaces/bricklink/credentials.js";
import type * as marketplaces_bricklink_envelope from "../marketplaces/bricklink/envelope.js";
import type * as marketplaces_bricklink_errors from "../marketplaces/bricklink/errors.js";
import type * as marketplaces_bricklink_freshness from "../marketplaces/bricklink/freshness.js";
import type * as marketplaces_bricklink_ids from "../marketplaces/bricklink/ids.js";
import type * as marketplaces_bricklink_inventory_actions from "../marketplaces/bricklink/inventory/actions.js";
import type * as marketplaces_bricklink_inventory_transformers from "../marketplaces/bricklink/inventory/transformers.js";
import type * as marketplaces_bricklink_notifications_actions from "../marketplaces/bricklink/notifications/actions.js";
import type * as marketplaces_bricklink_notifications_processor from "../marketplaces/bricklink/notifications/processor.js";
import type * as marketplaces_bricklink_notifications_store from "../marketplaces/bricklink/notifications/store.js";
import type * as marketplaces_bricklink_notifications_utilities from "../marketplaces/bricklink/notifications/utilities.js";
import type * as marketplaces_bricklink_notifications_webhook from "../marketplaces/bricklink/notifications/webhook.js";
import type * as marketplaces_bricklink_oauth from "../marketplaces/bricklink/oauth.js";
import type * as marketplaces_bricklink_orders_actions from "../marketplaces/bricklink/orders/actions.js";
import type * as marketplaces_bricklink_orders_mocks from "../marketplaces/bricklink/orders/mocks.js";
import type * as marketplaces_bricklink_orders_transformers_index from "../marketplaces/bricklink/orders/transformers/index.js";
import type * as marketplaces_bricklink_orders_transformers_transform from "../marketplaces/bricklink/orders/transformers/transform.js";
import type * as marketplaces_bricklink_rateLimit from "../marketplaces/bricklink/rateLimit.js";
import type * as marketplaces_bricklink_request from "../marketplaces/bricklink/request.js";
import type * as marketplaces_bricklink_transport from "../marketplaces/bricklink/transport.js";
import type * as marketplaces_brickowl_actions from "../marketplaces/brickowl/actions.js";
import type * as marketplaces_brickowl_bulk from "../marketplaces/brickowl/bulk.js";
import type * as marketplaces_brickowl_catalog from "../marketplaces/brickowl/catalog.js";
import type * as marketplaces_brickowl_client from "../marketplaces/brickowl/client.js";
import type * as marketplaces_brickowl_credentials from "../marketplaces/brickowl/credentials.js";
import type * as marketplaces_brickowl_errors from "../marketplaces/brickowl/errors.js";
import type * as marketplaces_brickowl_httpClient from "../marketplaces/brickowl/httpClient.js";
import type * as marketplaces_brickowl_ids from "../marketplaces/brickowl/ids.js";
import type * as marketplaces_brickowl_inventory_actions from "../marketplaces/brickowl/inventory/actions.js";
import type * as marketplaces_brickowl_inventory_bulk from "../marketplaces/brickowl/inventory/bulk.js";
import type * as marketplaces_brickowl_inventory_transformers from "../marketplaces/brickowl/inventory/transformers.js";
import type * as marketplaces_brickowl_mockOrders from "../marketplaces/brickowl/mockOrders.js";
import type * as marketplaces_brickowl_notifications_actions from "../marketplaces/brickowl/notifications/actions.js";
import type * as marketplaces_brickowl_orders_actions from "../marketplaces/brickowl/orders/actions.js";
import type * as marketplaces_brickowl_orders_transformers_index from "../marketplaces/brickowl/orders/transformers/index.js";
import type * as marketplaces_brickowl_orders_transformers_transform from "../marketplaces/brickowl/orders/transformers/transform.js";
import type * as marketplaces_brickowl_orders from "../marketplaces/brickowl/orders.js";
import type * as marketplaces_brickowl_rateLimit from "../marketplaces/brickowl/rateLimit.js";
import type * as marketplaces_brickowl_request from "../marketplaces/brickowl/request.js";
import type * as marketplaces_brickowl_validators from "../marketplaces/brickowl/validators.js";
import type * as marketplaces_shared_auth from "../marketplaces/shared/auth.js";
import type * as marketplaces_shared_credentialHelpers from "../marketplaces/shared/credentialHelpers.js";
import type * as marketplaces_shared_credentialTypes from "../marketplaces/shared/credentialTypes.js";
import type * as marketplaces_shared_credentials from "../marketplaces/shared/credentials.js";
import type * as marketplaces_shared_getCredentialDoc from "../marketplaces/shared/getCredentialDoc.js";
import type * as marketplaces_shared_rateLimitTypes from "../marketplaces/shared/rateLimitTypes.js";
import type * as marketplaces_shared_storeTypes from "../marketplaces/shared/storeTypes.js";
import type * as marketplaces_shared_webhookTokens from "../marketplaces/shared/webhookTokens.js";
import type * as marketplaces_shared_webhooks from "../marketplaces/shared/webhooks.js";
import type * as orders_ingestion from "../orders/ingestion.js";
import type * as orders_mockHelpers from "../orders/mockHelpers.js";
import type * as orders_mocks from "../orders/mocks.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_normalizers_bricklink from "../orders/normalizers/bricklink.js";
import type * as orders_normalizers_brickowl from "../orders/normalizers/brickowl.js";
import type * as orders_normalizers_index from "../orders/normalizers/index.js";
import type * as orders_normalizers_shared_errors from "../orders/normalizers/shared/errors.js";
import type * as orders_normalizers_shared_normalization from "../orders/normalizers/shared/normalization.js";
import type * as orders_normalizers_shared_types from "../orders/normalizers/shared/types.js";
import type * as orders_normalizers_shared_utils from "../orders/normalizers/shared/utils.js";
import type * as orders_normalizers_types from "../orders/normalizers/types.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_refactor_baseline_fixtures from "../orders/refactor_baseline/fixtures.js";
import type * as shared_auth_oauth from "../shared/auth/oauth.js";
import type * as shared_email_index from "../shared/email/index.js";
import type * as shared_encryption_index from "../shared/encryption/index.js";
import type * as shared_encryption_webcrypto from "../shared/encryption/webcrypto.js";
import type * as shared_env from "../shared/env.js";
import type * as shared_http_client from "../shared/http/client.js";
import type * as shared_http_retry from "../shared/http/retry.js";
import type * as shared_http_types from "../shared/http/types.js";
import type * as shared_http_upstreamRequest from "../shared/http/upstreamRequest.js";
import type * as shared_metrics_index from "../shared/metrics/index.js";
import type * as shared_ratelimit_config from "../shared/ratelimit/config.js";
import type * as shared_ratelimit_consume from "../shared/ratelimit/consume.js";
import type * as shared_ratelimit_dbRateLimiter from "../shared/ratelimit/dbRateLimiter.js";
import type * as users_actions from "../users/actions.js";
import type * as users_authorization from "../users/authorization.js";
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
  "catalog/categories": typeof catalog_categories;
  "catalog/colors": typeof catalog_colors;
  "catalog/ensure": typeof catalog_ensure;
  "catalog/helpers": typeof catalog_helpers;
  "catalog/mutations": typeof catalog_mutations;
  "catalog/parts": typeof catalog_parts;
  "catalog/prices": typeof catalog_prices;
  "catalog/rebrickable": typeof catalog_rebrickable;
  "catalog/validators": typeof catalog_validators;
  crons: typeof crons;
  hello: typeof hello;
  hello_impl: typeof hello_impl;
  http: typeof http;
  "identify/actions": typeof identify_actions;
  "identify/client": typeof identify_client;
  "identify/helpers": typeof identify_helpers;
  "identify/mutations": typeof identify_mutations;
  "inventory/actions": typeof inventory_actions;
  "inventory/helpers": typeof inventory_helpers;
  "inventory/import": typeof inventory_import;
  "inventory/mocks": typeof inventory_mocks;
  "inventory/mutations": typeof inventory_mutations;
  "inventory/queries": typeof inventory_queries;
  "inventory/sync": typeof inventory_sync;
  "inventory/syncWorker": typeof inventory_syncWorker;
  "inventory/types": typeof inventory_types;
  "inventory/validators": typeof inventory_validators;
  "lib/external/validate": typeof lib_external_validate;
  "marketplaces/bricklink/catalog/categories/actions": typeof marketplaces_bricklink_catalog_categories_actions;
  "marketplaces/bricklink/catalog/categories/transformers": typeof marketplaces_bricklink_catalog_categories_transformers;
  "marketplaces/bricklink/catalog/colors/actions": typeof marketplaces_bricklink_catalog_colors_actions;
  "marketplaces/bricklink/catalog/colors/transformers": typeof marketplaces_bricklink_catalog_colors_transformers;
  "marketplaces/bricklink/catalog/parts/actions": typeof marketplaces_bricklink_catalog_parts_actions;
  "marketplaces/bricklink/catalog/parts/transformers": typeof marketplaces_bricklink_catalog_parts_transformers;
  "marketplaces/bricklink/catalog/priceGuides/actions": typeof marketplaces_bricklink_catalog_priceGuides_actions;
  "marketplaces/bricklink/catalog/priceGuides/transformers": typeof marketplaces_bricklink_catalog_priceGuides_transformers;
  "marketplaces/bricklink/catalog/refresh": typeof marketplaces_bricklink_catalog_refresh;
  "marketplaces/bricklink/catalog/shared/health": typeof marketplaces_bricklink_catalog_shared_health;
  "marketplaces/bricklink/catalog/shared/request": typeof marketplaces_bricklink_catalog_shared_request;
  "marketplaces/bricklink/catalog/shared/transformers": typeof marketplaces_bricklink_catalog_shared_transformers;
  "marketplaces/bricklink/credentials": typeof marketplaces_bricklink_credentials;
  "marketplaces/bricklink/envelope": typeof marketplaces_bricklink_envelope;
  "marketplaces/bricklink/errors": typeof marketplaces_bricklink_errors;
  "marketplaces/bricklink/freshness": typeof marketplaces_bricklink_freshness;
  "marketplaces/bricklink/ids": typeof marketplaces_bricklink_ids;
  "marketplaces/bricklink/inventory/actions": typeof marketplaces_bricklink_inventory_actions;
  "marketplaces/bricklink/inventory/transformers": typeof marketplaces_bricklink_inventory_transformers;
  "marketplaces/bricklink/notifications/actions": typeof marketplaces_bricklink_notifications_actions;
  "marketplaces/bricklink/notifications/processor": typeof marketplaces_bricklink_notifications_processor;
  "marketplaces/bricklink/notifications/store": typeof marketplaces_bricklink_notifications_store;
  "marketplaces/bricklink/notifications/utilities": typeof marketplaces_bricklink_notifications_utilities;
  "marketplaces/bricklink/notifications/webhook": typeof marketplaces_bricklink_notifications_webhook;
  "marketplaces/bricklink/oauth": typeof marketplaces_bricklink_oauth;
  "marketplaces/bricklink/orders/actions": typeof marketplaces_bricklink_orders_actions;
  "marketplaces/bricklink/orders/mocks": typeof marketplaces_bricklink_orders_mocks;
  "marketplaces/bricklink/orders/transformers/index": typeof marketplaces_bricklink_orders_transformers_index;
  "marketplaces/bricklink/orders/transformers/transform": typeof marketplaces_bricklink_orders_transformers_transform;
  "marketplaces/bricklink/rateLimit": typeof marketplaces_bricklink_rateLimit;
  "marketplaces/bricklink/request": typeof marketplaces_bricklink_request;
  "marketplaces/bricklink/transport": typeof marketplaces_bricklink_transport;
  "marketplaces/brickowl/actions": typeof marketplaces_brickowl_actions;
  "marketplaces/brickowl/bulk": typeof marketplaces_brickowl_bulk;
  "marketplaces/brickowl/catalog": typeof marketplaces_brickowl_catalog;
  "marketplaces/brickowl/client": typeof marketplaces_brickowl_client;
  "marketplaces/brickowl/credentials": typeof marketplaces_brickowl_credentials;
  "marketplaces/brickowl/errors": typeof marketplaces_brickowl_errors;
  "marketplaces/brickowl/httpClient": typeof marketplaces_brickowl_httpClient;
  "marketplaces/brickowl/ids": typeof marketplaces_brickowl_ids;
  "marketplaces/brickowl/inventory/actions": typeof marketplaces_brickowl_inventory_actions;
  "marketplaces/brickowl/inventory/bulk": typeof marketplaces_brickowl_inventory_bulk;
  "marketplaces/brickowl/inventory/transformers": typeof marketplaces_brickowl_inventory_transformers;
  "marketplaces/brickowl/mockOrders": typeof marketplaces_brickowl_mockOrders;
  "marketplaces/brickowl/notifications/actions": typeof marketplaces_brickowl_notifications_actions;
  "marketplaces/brickowl/orders/actions": typeof marketplaces_brickowl_orders_actions;
  "marketplaces/brickowl/orders/transformers/index": typeof marketplaces_brickowl_orders_transformers_index;
  "marketplaces/brickowl/orders/transformers/transform": typeof marketplaces_brickowl_orders_transformers_transform;
  "marketplaces/brickowl/orders": typeof marketplaces_brickowl_orders;
  "marketplaces/brickowl/rateLimit": typeof marketplaces_brickowl_rateLimit;
  "marketplaces/brickowl/request": typeof marketplaces_brickowl_request;
  "marketplaces/brickowl/validators": typeof marketplaces_brickowl_validators;
  "marketplaces/shared/auth": typeof marketplaces_shared_auth;
  "marketplaces/shared/credentialHelpers": typeof marketplaces_shared_credentialHelpers;
  "marketplaces/shared/credentialTypes": typeof marketplaces_shared_credentialTypes;
  "marketplaces/shared/credentials": typeof marketplaces_shared_credentials;
  "marketplaces/shared/getCredentialDoc": typeof marketplaces_shared_getCredentialDoc;
  "marketplaces/shared/rateLimitTypes": typeof marketplaces_shared_rateLimitTypes;
  "marketplaces/shared/storeTypes": typeof marketplaces_shared_storeTypes;
  "marketplaces/shared/webhookTokens": typeof marketplaces_shared_webhookTokens;
  "marketplaces/shared/webhooks": typeof marketplaces_shared_webhooks;
  "orders/ingestion": typeof orders_ingestion;
  "orders/mockHelpers": typeof orders_mockHelpers;
  "orders/mocks": typeof orders_mocks;
  "orders/mutations": typeof orders_mutations;
  "orders/normalizers/bricklink": typeof orders_normalizers_bricklink;
  "orders/normalizers/brickowl": typeof orders_normalizers_brickowl;
  "orders/normalizers/index": typeof orders_normalizers_index;
  "orders/normalizers/shared/errors": typeof orders_normalizers_shared_errors;
  "orders/normalizers/shared/normalization": typeof orders_normalizers_shared_normalization;
  "orders/normalizers/shared/types": typeof orders_normalizers_shared_types;
  "orders/normalizers/shared/utils": typeof orders_normalizers_shared_utils;
  "orders/normalizers/types": typeof orders_normalizers_types;
  "orders/queries": typeof orders_queries;
  "orders/refactor_baseline/fixtures": typeof orders_refactor_baseline_fixtures;
  "shared/auth/oauth": typeof shared_auth_oauth;
  "shared/email/index": typeof shared_email_index;
  "shared/encryption/index": typeof shared_encryption_index;
  "shared/encryption/webcrypto": typeof shared_encryption_webcrypto;
  "shared/env": typeof shared_env;
  "shared/http/client": typeof shared_http_client;
  "shared/http/retry": typeof shared_http_retry;
  "shared/http/types": typeof shared_http_types;
  "shared/http/upstreamRequest": typeof shared_http_upstreamRequest;
  "shared/metrics/index": typeof shared_metrics_index;
  "shared/ratelimit/config": typeof shared_ratelimit_config;
  "shared/ratelimit/consume": typeof shared_ratelimit_consume;
  "shared/ratelimit/dbRateLimiter": typeof shared_ratelimit_dbRateLimiter;
  "users/actions": typeof users_actions;
  "users/authorization": typeof users_authorization;
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
