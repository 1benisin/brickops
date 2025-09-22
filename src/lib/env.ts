type EnvSource = Record<string, string | undefined>;

export interface AppEnv {
  NEXT_PUBLIC_CONVEX_URL: string;
  CONVEX_DEPLOYMENT: string;
}

function requireValue(raw: string | undefined, key: string): string {
  if (!raw) {
    throw new Error(`${key} must be defined`);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${key} cannot be empty`);
  }

  return trimmed;
}

function validateUrl(value: string, key: string): string {
  try {
    const url = new URL(value);
    // Normalize to origin WITHOUT a trailing slash to avoid constructing URLs like
    // "wss://<deployment>.convex.cloud//api/..." in Convex client internals.
    return url.origin;
  } catch (error) {
    throw new Error(`${key} must be a valid URL`);
  }
}

function parseEnv(source: EnvSource): AppEnv {
  const url = validateUrl(
    requireValue(source.NEXT_PUBLIC_CONVEX_URL, "NEXT_PUBLIC_CONVEX_URL"),
    "NEXT_PUBLIC_CONVEX_URL",
  );

  const deploymentRaw = source.CONVEX_DEPLOYMENT ?? "dev";
  const deployment = requireValue(deploymentRaw, "CONVEX_DEPLOYMENT");

  return {
    NEXT_PUBLIC_CONVEX_URL: url,
    CONVEX_DEPLOYMENT: deployment,
  };
}

let cachedEnv: AppEnv | null = null;

export function loadEnv(source: EnvSource = process.env): AppEnv {
  // In Node (server/build), we can parse from a provided source normally.
  // In the browser, Next.js only statically inlines direct references to
  // process.env.NEXT_PUBLIC_* and does not populate a runtime process.env object.
  // Keep this function server-focused to avoid accidental browser usage.
  return parseEnv(source);
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    if (typeof window !== "undefined") {
      // Browser/client bundle: reference public env via direct access so Next inlines it.
      const inlinedUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      const url = validateUrl(
        requireValue(inlinedUrl, "NEXT_PUBLIC_CONVEX_URL"),
        "NEXT_PUBLIC_CONVEX_URL",
      );

      // CONVEX_DEPLOYMENT is not required in the browser; provide a harmless default.
      cachedEnv = {
        NEXT_PUBLIC_CONVEX_URL: url,
        CONVEX_DEPLOYMENT: "dev",
      };
    } else {
      // Server/build time: parse from real environment.
      cachedEnv = parseEnv(process.env);
    }
  }

  return cachedEnv;
}
