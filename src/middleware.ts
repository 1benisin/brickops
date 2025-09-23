import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password/(.*)",
  "/api/auth/(.*)",
  "/api/health/(.*)",
]);

const isAuthRoute = createRouteMatcher([
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password/(.*)",
]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    if (isPublicRoute(request)) {
      return;
    }

    // In test environment, check for mock auth cookie
    const isTestEnvironment =
      process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "true";
    if (isTestEnvironment) {
      const mockAuthCookie = request.cookies.get("convex-auth-token");
      if (mockAuthCookie && mockAuthCookie.value === "mock-auth-token") {
        if (isAuthRoute(request)) {
          return nextjsMiddlewareRedirect(request, "/dashboard");
        }
        return; // Allow access to protected routes
      }
    }

    const authenticated = await convexAuth.isAuthenticated();
    if (!authenticated) {
      return nextjsMiddlewareRedirect(request, "/login");
    }

    if (isAuthRoute(request)) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }

    return;
  },
  {
    cookieConfig: {
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  },
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
