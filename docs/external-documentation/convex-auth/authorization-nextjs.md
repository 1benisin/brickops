# Server-side authentication in Next.js - Convex Auth

## Server-side authentication in Next.js

You can set up your Next.js App Router app to have access to the authentication state on the server.

## Setup[](#setup)

Make sure your React providers and middleware are [correctly set up](about:/auth/setup#set-up-the-react-provider) first.

## Require authentication for certain routes[](#require-authentication-for-certain-routes)

By default, all routes can be accessed without authenticating. You can configure which routes require authentication in your `middleware.ts`:

In general, you'll likely want to redirect when an unauthenticated user tries to access a route that requires authentication.

To do this, you can pass a function to `convexAuthNextjsMiddleware`. This function can also be used to compose other middleware behaviors.

This function has as arguments the `NextRequest`, the `NextFetchEvent`, and the `ConvexAuthNextjsContext`. `convexAuth.isAuthenticated()` and `convexAuth.getToken()` function similarly to `isAuthenticatedNextjs` and `convexAuthNextjsToken`, but should be used in middleware to ensure they reflect any updates to the request context from `convexAuthNextjsMiddleware`.

Convex Auth provides an API and helper functions for implementing your middleware:

- `createRouteMatcher` is a helper function that uses the same [syntax (opens in a new tab)](https://github.com/pillarjs/path-to-regexp) as the middleware `config`. You call it with a list of glob patterns, and it returns a function that given the `NextRequest` returns whether the route matches.
- `nextjsMiddlewareRedirect` is a simple shortcut for triggering redirects:

  You can inline this code if you need more control over the target URL.

## Configure cookie expiration[](#configure-cookie-expiration)

You can configure the expiration of the authentication cookie by passing a `cookieConfig` option to `convexAuthNextjsMiddleware`.

If you don't set this option, the cookie will be considered a "session cookie" and be deleted when the browser session ends, which depends from browser to browser.

## Preloading and loading data[](#preloading-and-loading-data)

To preload or load data on your Next.js server from your Convex backend, you can use [`preloadQuery` and `fetchQuery` (opens in a new tab)](https://docs.convex.dev/client/react/nextjs/server-rendering#preloading-data-for-client-components) and the `convexAuthNextjsToken` function from `@convex-dev/auth/nextjs/server`:

## Calling authenticated mutations and actions[](#calling-authenticated-mutations-and-actions)

You can call Convex [mutations (opens in a new tab)](https://docs.convex.dev/functions/mutation-functions) and [actions (opens in a new tab)](https://docs.convex.dev/functions/actions) from Next.js [Server Actions (opens in a new tab)](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) and `POST` or `PUT` [Route Handlers (opens in a new tab)](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).

[Authorization](https://labs.convex.dev/auth/authz "Authorization")
[Production](https://labs.convex.dev/auth/production "Production")
