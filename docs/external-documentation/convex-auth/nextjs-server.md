# nextjs/server - Convex Auth

## nextjs/server

ConvexAuthNextjsServerProvider()
[](#convexauthnextjsserverprovider)

---

Wrap your app with this provider in your root `layout.tsx`.

### Parameters

- Parameter: props
  - Type: object
  - Description: ‐
- Parameter: props.apiRoute?
  - Type: string
  - Description: You can customize the route path that handles authenticationactions via this prop and the apiRoute option to convexAuthNextjsMiddleWare.Defaults to /api/auth.
- Parameter: props.storage?
  - Type: "localStorage" | "inMemory"
  - Description: Choose how the auth information will be stored on the client.Defaults to "localStorage".If you choose "inMemory", different browser tabs will nothave a synchronized authentication state.
- Parameter: props.storageNamespace?
  - Type: string
  - Description: Optional namespace for keys used to store tokens. The keysdetermine whether the tokens are shared or not.Any non-alphanumeric characters will be ignored.Defaults to process.env.NEXT_PUBLIC_CONVEX_URL.
- Parameter: props.shouldHandleCode?
  - Type: () => boolean
  - Description: Callback to determine whether Convex Auth should handle the code parameter for a given request.If not provided, Convex Auth will handle all code parameters.If provided, Convex Auth will only handle code parameters when the callback returns true.
- Parameter: props.verbose?
  - Type: boolean
  - Description: Turn on debugging logs.
- Parameter: props.children
  - Type: ReactNode
  - Description: Children components can call Convex hooksand useAuthActions.

### Returns

`Promise`<`Element`\>

### Defined in

[src/nextjs/server/index.tsx:30 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L30)

---

convexAuthNextjsToken()
[](#convexauthnextjstoken)

---

Retrieve the token for authenticating calls to your Convex backend from Server Components, Server Actions and Route Handlers.

### Returns

`Promise`<`undefined` | `string`\>

The token if the client is authenticated, otherwise `undefined`.

### Defined in

[src/nextjs/server/index.tsx:100 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L100)

---

isAuthenticatedNextjs()
[](#isauthenticatednextjs)

---

Whether the client is authenticated, which you can check in Server Actions, Route Handlers and Middleware.

Avoid the pitfall of checking authentication state in layouts, since they won't stop nested pages from rendering.

### Parameters

| Parameter          | Type   |
| ------------------ | ------ |
| options            | object |
| options.convexUrl? | string |

### Returns

`Promise`<`boolean`\>

### Defined in

[src/nextjs/server/index.tsx:111 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L111)

---

## ConvexAuthNextjsMiddlewareContext[](#convexauthnextjsmiddlewarecontext)

In `convexAuthNextjsMiddleware`, you can use this context to get the token and check if the client is authenticated in place of `convexAuthNextjsToken` and `isAuthenticatedNextjs`.

### Type declaration

#### getToken()

[](#gettoken)

##### Returns

`Promise`<`string` | `undefined`\>

#### isAuthenticated()

[](#isauthenticated)

##### Returns

`Promise`<`boolean`\>

### Defined in

[src/nextjs/server/index.tsx:135 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L135)

---

## ConvexAuthNextjsMiddlewareOptions[](#convexauthnextjsmiddlewareoptions)

Options for the `convexAuthNextjsMiddleware` function.

### Type declaration

#### convexUrl?[](#convexurl)

> `optional` **convexUrl**: `string`

The URL of the Convex deployment to use for authentication.

Defaults to `process.env.NEXT_PUBLIC_CONVEX_URL`.

#### apiRoute?[](#apiroute)

> `optional` **apiRoute**: `string`

You can customize the route path that handles authentication actions via this option and the `apiRoute` prop of `ConvexAuthNextjsProvider`.

Defaults to `/api/auth`.

#### cookieConfig?[](#cookieconfig)

The cookie config to use for the auth cookies.

`maxAge` is the number of seconds the cookie will be valid for. If this is not set, the cookie will be a session cookie.

See [MDN Web Docs (opens in a new tab)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#defining_the_lifetime_of_a_cookie) for more information.

#### cookieConfig.maxAge[](#cookieconfigmaxage)

#### verbose?[](#verbose)

> `optional` **verbose**: `boolean`

Turn on debugging logs.

#### shouldHandleCode()?[](#shouldhandlecode)

Callback to determine whether Convex Auth should handle the code parameter for a given request. If not provided, Convex Auth will handle all code parameters. If provided, Convex Auth will only handle code parameters when the callback returns true.

##### Parameters

| Parameter | Type        |
| --------- | ----------- |
| request   | NextRequest |

##### Returns

`boolean`

### Defined in

[src/nextjs/server/index.tsx:143 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L143)

---

convexAuthNextjsMiddleware()
[](#convexauthnextjsmiddleware)

---

Use in your `middleware.ts` to enable your Next.js app to use Convex Auth for authentication on the server.

### Parameters

- Parameter: handler?
  - Type: (request, ctx) => NextMiddlewareResult | Promise<NextMiddlewareResult>
  - Description: A custom handler, which you can use to decidewhich routes should be accessible based on the client's authentication.
- Parameter: options?
  - Type: ConvexAuthNextjsMiddlewareOptions
  - Description: ‐

### Returns

`NextMiddleware`

A Next.js middleware.

### Defined in

[src/nextjs/server/index.tsx:184 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L184)

---

nextjsMiddlewareRedirect()
[](#nextjsmiddlewareredirect)

---

Helper for redirecting to a different route from a Next.js middleware.

### Parameters

| Parameter | Type        | Description                                     |
| --------- | ----------- | ----------------------------------------------- |
| request   | NextRequest | The incoming request handled by the middleware. |
| pathname  | string      | The route path to redirect to.                  |

### Returns

`NextResponse`<`unknown`\>

### Defined in

[src/nextjs/server/index.tsx:301 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/index.tsx#L301)

---

## RouteMatcherParam[](#routematcherparam)

See [createRouteMatcher](about:/auth/api_reference/nextjs/server#createroutematcher) for more information.

### Defined in

[src/nextjs/server/routeMatcher.ts:44 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/routeMatcher.ts#L44)

---

createRouteMatcher()
[](#createroutematcher)

---

Returns a function that accepts a `Request` object and returns whether the request matches the list of predefined routes that can be passed in as the first argument.

You can use glob patterns to match multiple routes or a function to match against the request object. Path patterns and limited regular expressions are supported. For more information, see: [https://www.npmjs.com/package/path-to-regexp/v/6.3.0 (opens in a new tab)](https://www.npmjs.com/package/path-to-regexp/v/6.3.0)

### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| routes    | RouteMatcherParam |

### Returns

`Function`

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| req       | NextRequest |

#### Returns

`boolean`

### Defined in

[src/nextjs/server/routeMatcher.ts:58 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/server/routeMatcher.ts#L58)

[nextjs](https://labs.convex.dev/auth/api_reference/nextjs "nextjs")
[Anonymous](https://labs.convex.dev/auth/api_reference/providers/Anonymous "Anonymous")
