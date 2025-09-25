"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { Button, Input } from "@/components/ui";

const MIN_PASSWORD_LENGTH = 8;

function getFriendlySignupErrorMessage(error: unknown) {
  const rawMessage =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";

  const message = rawMessage.toLowerCase();

  if (message.includes("missing environment variable") && message.includes("jwt")) {
    return "We're setting up authentication. Please try again in a moment or contact support if this persists.";
  }

  if (message.includes("invite code not found")) {
    return "That invite code wasn't recognized. Please check with your team owner.";
  }

  if (message.includes("business account is not fully provisioned")) {
    return "This team invite isn't ready yet. Ask the owner to finish setup.";
  }

  if (message.includes("email") && message.includes("exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }

  return "Unable to create account right now. Please review your details and try again.";
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatches from browser extensions/autofill by
  // rendering the interactive form only after client mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Prefill invite code from URL (?inviteCode=abcd1234 or ?code=abcd1234)
  useEffect(() => {
    const code = searchParams?.get("inviteCode") || searchParams?.get("code");
    if (code) {
      setInviteCode(code);
    }
  }, [searchParams]);

  const inviteProvided = useMemo(() => Boolean(inviteCode.trim()), [inviteCode]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedBusiness = businessName.trim();
    const normalizedInviteCode = inviteCode.trim();

    if (!normalizedEmail || !normalizedFirstName || !normalizedLastName) {
      setError("Please complete all required fields");
      return;
    }

    if (!normalizedInviteCode && !normalizedBusiness) {
      setError("Provide a business name or invite code");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    startTransition(async () => {
      try {
        await signIn("password", {
          flow: "signUp",
          email: normalizedEmail,
          password,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          ...(normalizedInviteCode
            ? { inviteCode: normalizedInviteCode }
            : { businessName: normalizedBusiness }),
        });
        router.push("/dashboard");
      } catch (signupError) {
        console.error(signupError);
        setError(getFriendlySignupErrorMessage(signupError));
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-2xl rounded-lg border bg-background p-8 shadow-sm">
        <div className="mb-6 space-y-1 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">BrickOps</p>
          <h1 className="text-2xl font-semibold">Create your BrickOps workspace</h1>
          <p className="text-sm text-muted-foreground">
            Invite your team with a shared business account and manage inventory together.
          </p>
        </div>

        {mounted ? (
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium text-foreground">
                First name
              </label>
              <Input
                id="firstName"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={isPending}
                required
                data-testid="signup-form-firstName"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium text-foreground">
                Last name
              </label>
              <Input
                id="lastName"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={isPending}
                required
                data-testid="signup-form-lastName"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Work email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isPending}
                required
                data-testid="signup-form-email"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isPending}
                required
                data-testid="signup-form-password"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="businessName" className="text-sm font-medium text-foreground">
                Business name
              </label>
              <Input
                id="businessName"
                placeholder="Brick Central LLC"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                disabled={isPending || inviteProvided}
                required={!inviteProvided}
              />
              <p className="text-xs text-muted-foreground">
                Already invited to an existing team? Enter the invite code below instead.
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="inviteCode" className="text-sm font-medium text-foreground">
                Team invite code (optional)
              </label>
              <Input
                id="inviteCode"
                placeholder="abcd1234"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                disabled={isPending}
              />
            </div>

            {error ? <p className="sm:col-span-2 text-sm text-destructive">{error}</p> : null}

            <div className="sm:col-span-2">
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Creating workspace…" : "Create account"}
              </Button>
            </div>
          </form>
        ) : (
          // Initial server render and pre-hydration client render placeholder
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden />
        )}

        <div className="mt-6 space-y-1 text-center text-sm text-muted-foreground">
          <p>
            Already have a business account?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in instead
            </Link>
          </p>
          <Link href="/" className="text-xs">
            Return to marketing site
          </Link>
        </div>
      </div>
    </div>
  );
}
