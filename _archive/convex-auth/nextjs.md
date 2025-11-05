# nextjs - Convex Auth

## nextjs

ConvexAuthNextjsProvider()
[](#convexauthnextjsprovider)

---

Replace your `ConvexProvider` in a Client Component with this component to enable authentication in your Next.js app.

```
"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
```

### Parameters

| Parameter      | Type              | Description                                                  |
| -------------- | ----------------- | ------------------------------------------------------------ |
| props          | object            | ‐                                                            |
| props.client   | ConvexReactClient | Your ConvexReactClient (opens in a new tab).                 |
| props.children | ReactNode         | Children components can call Convex hooksand useAuthActions. |

### Returns

`Element`

### Defined in

[src/nextjs/index.tsx:33 (opens in a new tab)](https://github.com/get-convex/convex-auth/blob/main/src/nextjs/index.tsx#L33)

[server](https://labs.convex.dev/auth/api_reference/server "server")
[server](https://labs.convex.dev/auth/api_reference/nextjs/server "server")
