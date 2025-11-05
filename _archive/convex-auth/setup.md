# Set Up Convex Auth - Convex Auth

## Set Up Convex Auth

## Creating a new project[](#creating-a-new-project)

To start a new project from scratch with Convex and Convex Auth, run

and choose `React (Vite)` and then `Convex Auth`.

---

This guide assumes you already have a working Convex app from following the instructions above.

### Install the NPM library[](#install-the-npm-library)

```
npm install @convex-dev/auth @auth/core@0.37.0
```

This also installs `@auth/core`, which you will use during provider configuration later.

### Run the initialization command[](#run-the-initialization-command)

This sets up your project for authenticating via the library.

Alternatively you can perform these steps manually: [Manual Setup](https://labs.convex.dev/auth/setup/manual)

### Add authentication tables to your schema[](#add-authentication-tables-to-your-schema)

Convex Auth assumes you have several tables set up with specific indexes.

You can add these tables to your [schema (opens in a new tab)](https://docs.convex.dev/database/schemas) via the `authTables` export:

convex/schema.ts

```
import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

const schema = defineSchema({
  ...authTables,
  // Your other tables...
});

export default schema;
```

### Set up the React provider[](#set-up-the-react-provider)

Replace `ConvexProvider` from `convex/react` with `ConvexAuthProvider` from `@convex-dev/auth/react`:

src/main.tsx

```
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import App from "./App.tsx";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
```

The initial setup is done. Next you'll [choose and configure authentication methods](https://labs.convex.dev/auth/config).

[Introduction](https://labs.convex.dev/auth "Introduction")
[Manual Setup](https://labs.convex.dev/auth/setup/manual "Manual Setup")
