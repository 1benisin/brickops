"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { Button, Input } from "@/components/ui";

function normalize(value: string) {
  return value.trim();
}

function getFriendlyAuthErrorMessage(error: unknown) {
  const rawMessage =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";

  const message = rawMessage.toLowerCase();

  if (
    message.includes("invalidaccountid") ||
    message.includes("account not found") ||
    message.includes("no account")
  ) {
    return "We couldn't find an account with that email. You can create one below.";
  }

  if (
    message.includes("invalidcredentials") ||
    message.includes("invalid credentials") ||
    message.includes("password")
  ) {
    return "Incorrect email or password.";
  }

  if (message.includes("missing environment variable") && message.includes("jwt")) {
    return "We're finishing authentication setup. Please try again shortly or contact support.";
  }

  if (message.includes("too many") || message.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return "Unable to sign in. Please check your email and password.";
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatches from browser extensions/autofill by
  // rendering the interactive form only after client mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const nextEmail = normalize(email);
    const nextPassword = password;

    if (!nextEmail || !nextPassword) {
      setError("Email and password are required");
      return;
    }

    startTransition(async () => {
      try {
        await signIn("password", {
          flow: "signIn",
          email: nextEmail,
          password: nextPassword,
        });
        setSuccessMessage("Signed in successfully");
        router.push("/dashboard");
      } catch (signinError) {
        console.error(signinError);
        setError(getFriendlyAuthErrorMessage(signinError));
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">BrickOps</p>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your shared retail operations workspace.
          </p>
        </div>

        {mounted ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isPending}
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {successMessage ? <p className="text-sm text-green-600">{successMessage}</p> : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          // Initial server render and pre-hydration client render placeholder
          <div className="space-y-4" aria-hidden />
        )}

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <Link href="/reset-password" className="text-primary underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
          <p>
            Need an account?{" "}
            <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
              Create one now
            </Link>
          </p>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          <Link href="/">Return to marketing site</Link>
        </div>
      </div>
    </div>
  );
}
