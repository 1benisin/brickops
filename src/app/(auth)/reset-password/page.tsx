"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { Button, Input } from "@/components/ui";

type Step = "request" | "verify";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email associated with your account");
      return;
    }

    startTransition(async () => {
      try {
        await signIn("password", {
          flow: "reset",
          email: normalizedEmail,
        });
        setInfo(
          "We sent a verification code to your email. Enter the code and your new password below.",
        );
        setStep("verify");
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "Unable to start reset";
        setError(message);
      }
    });
  };

  const handleVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedCode = code.trim();

    if (!sanitizedCode) {
      setError("Enter the verification code from your email");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    startTransition(async () => {
      try {
        await signIn("password", {
          flow: "reset-verification",
          email: normalizedEmail,
          code: sanitizedCode,
          newPassword,
        });
        setInfo("Password updated. You can now sign in with your new password.");
        router.push("/login");
      } catch (verifyError) {
        const message = verifyError instanceof Error ? verifyError.message : "Invalid code";
        setError(message);
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">BrickOps</p>
          <h1 className="text-2xl font-semibold">Reset password</h1>
          <p className="text-sm text-muted-foreground">
            {step === "request"
              ? "Enter your email to receive a verification code."
              : "Enter the verification code from your email and choose a new password."}
          </p>
        </div>

        {step === "request" ? (
          <form className="space-y-4" onSubmit={handleRequest}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isPending}
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-green-600">{info}</p> : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Sending code…" : "Send verification code"}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleVerify}>
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium text-foreground">
                Verification code
              </label>
              <Input
                id="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
                New password
              </label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={isPending}
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-green-600">{info}</p> : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Updating password…" : "Update password"}
            </Button>
          </form>
        )}

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            Remembered your password?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Return to sign-in
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
