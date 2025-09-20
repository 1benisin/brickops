# Routing

## Route Configuration

```typescript
// middleware.ts - Authentication and route protection
import { NextRequest, NextResponse } from "next/server";

const ROUTE_PERMISSIONS = {
  public: ["/login", "/signup", "/"],
  protected: ["/dashboard", "/inventory", "/orders", "/catalog", "/identify"],
  ownerOnly: ["/settings/users", "/settings/billing"],
  managerPlus: ["/orders/picking", "/inventory/upload"],
  pickerPlus: ["/orders/picking/[sessionId]"],
} as const;

const ROLE_HIERARCHY = {
  "view-only": 0,
  picker: 1,
  manager: 2,
  owner: 3,
} as const;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get("convex-auth-token")?.value;

  // Authentication and role-based protection logic...

  return NextResponse.next();
}
```
