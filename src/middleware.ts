import { NextResponse } from "next/server";

export function middleware() {
  const response = NextResponse.next();

  // Example of where auth or feature flags would be enforced.
  response.headers.set("x-brickops-middleware", "enabled");
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
