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
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as functions_catalog from "../functions/catalog.js";
import type * as functions_hello from "../functions/hello.js";
import type * as functions_hello_impl from "../functions/hello_impl.js";
import type * as functions_internal from "../functions/internal.js";
import type * as functions_inventory from "../functions/inventory.js";
import type * as functions_users from "../functions/users.js";
import type * as http from "../http.js";
import type * as lib_external_bricklink from "../lib/external/bricklink.js";
import type * as lib_external_brickognize from "../lib/external/brickognize.js";
import type * as lib_external_brickowl from "../lib/external/brickowl.js";
import type * as lib_external_circuitBreaker from "../lib/external/circuitBreaker.js";
import type * as lib_external_email from "../lib/external/email.js";
import type * as lib_external_env from "../lib/external/env.js";
import type * as lib_external_httpClient from "../lib/external/httpClient.js";
import type * as lib_external_metrics from "../lib/external/metrics.js";
import type * as lib_external_rateLimiter from "../lib/external/rateLimiter.js";
import type * as lib_external_retry from "../lib/external/retry.js";
import type * as lib_external_types from "../lib/external/types.js";
import type * as lib_external_validate from "../lib/external/validate.js";
import type * as lib_webcrypto from "../lib/webcrypto.js";

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
  crons: typeof crons;
  "functions/catalog": typeof functions_catalog;
  "functions/hello": typeof functions_hello;
  "functions/hello_impl": typeof functions_hello_impl;
  "functions/internal": typeof functions_internal;
  "functions/inventory": typeof functions_inventory;
  "functions/users": typeof functions_users;
  http: typeof http;
  "lib/external/bricklink": typeof lib_external_bricklink;
  "lib/external/brickognize": typeof lib_external_brickognize;
  "lib/external/brickowl": typeof lib_external_brickowl;
  "lib/external/circuitBreaker": typeof lib_external_circuitBreaker;
  "lib/external/email": typeof lib_external_email;
  "lib/external/env": typeof lib_external_env;
  "lib/external/httpClient": typeof lib_external_httpClient;
  "lib/external/metrics": typeof lib_external_metrics;
  "lib/external/rateLimiter": typeof lib_external_rateLimiter;
  "lib/external/retry": typeof lib_external_retry;
  "lib/external/types": typeof lib_external_types;
  "lib/external/validate": typeof lib_external_validate;
  "lib/webcrypto": typeof lib_webcrypto;
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
