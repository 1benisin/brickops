"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { Button, Input } from "@/components/ui";

function normalize(value: string) {
  return value.trim();
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        const message =
          signinError instanceof Error ? signinError.message : "Unable to sign in";
        setError(message);
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
