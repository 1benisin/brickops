# Authorization - Convex Auth

## Authorization

Now that you have set up and configured authentication with Convex Auth, learn how to use the authentication state in your frontend and backend.

## Sign in[](#sign-in)

See each authentication method's [Configuration](https://labs.convex.dev/auth/config) page for how to build a sign-in UI.

## Sign out[](#sign-out)

You can sign the user out via the `signOut` function:

## Determine what UI to show based on signed-in state[](#determine-what-ui-to-show-based-on-signed-in-state)

You can control which content signed-in and signed-out users can see with the components from `convex/react`. You can combine them with your custom sign-in and sign-out components:

## Authenticate HTTP actions[](#authenticate-http-actions)

Sometimes your React frontend might need to call your Convex backend via HTTP, usually to stream data, such as when uploading files or when loading a slowly generated AI response.

To authenticate HTTP actions you will need to access the JWT token the client uses for authenticating with the backend, which you get from the `useAuthToken` hook:

## Use authentication state in backend functions[](#use-authentication-state-in-backend-functions)

Within a Convex [function (opens in a new tab)](https://docs.convex.dev/functions), you can access information about the currently logged-in user and session via helper functions exported from `@convex-dev/auth/server` file.

The `getAuthUserId` and `getAuthSessionId` methods use the Convex-built-in `ctx.auth.getUserIdentity()` under the hood and provide a typed API.

### Data model[](#data-model)

Convex Auth defines [`users`](about:/auth/api_reference/server#users) and [`authSessions`](about:/auth/api_reference/server#authsessions) tables for you.

When a user first signs up, a document is created in the `users` table.

When a user signs in (including after initial sign-up), a document is created in the `authSessions` table. The session document exists until the session expires or the user signs out. See [session document lifecycle](about:/auth/advanced#session-document-lifecycle).

One user can have many active sessions simultaneously. For web apps the same session is shared by all browser tabs by default, but [this can be configured](about:/auth/api_reference/react#convexauthprovider).

### Get currently signed-in user ID[](#get-currently-signed-in-user-id)

To get the currently signed-in user's ID, call `getAuthUserId` and pass it a query, mutation or action `ctx`:

The function returns `Doc<"users">` (or `null` when the client isn't authenticated).

### Get current session ID[](#get-current-session-id)

To get the current session ID, call `getAuthSessionId` and pass it a query, mutation or action `ctx`:

The function returns `Doc<"authSessions">` (or `null` when the client isn't authenticated).

### Loading users and sessions[](#loading-users-and-sessions)

You can retrieve the user or session document via `ctx.db.get()` in queries and mutations.

See [Customizing Schema](https://labs.convex.dev/auth/setup/schema) for guidance on attaching additional information to users and sessions.

## Server-side authentication in Next.js[](#server-side-authentication-in-nextjs)

You can set up your Next.js App Router app to have access to the authentication state on the server.

See the dedicated [Next.js page](https://labs.convex.dev/auth/authz/nextjs).

[Passwords](https://labs.convex.dev/auth/config/passwords "Passwords")
[Next.js](https://labs.convex.dev/auth/authz/nextjs "Next.js")
