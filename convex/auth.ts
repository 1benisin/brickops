import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import type { GenericMutationCtx } from "convex/server";
import { ConvexError } from "convex/values";

import { sendPasswordResetEmail } from "./lib/external/email";

type Role = "owner" | "manager" | "picker";
type UserStatus = "active" | "invited";

type CreateOrUpdateUserArgs = Parameters<
  NonNullable<Parameters<typeof convexAuth>[0]["callbacks"]>["createOrUpdateUser"]
>[1];

type AuthMutationCtx = GenericMutationCtx<Record<string, never>>;

type ProfileParams = {
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  businessName?: string;
  inviteCode?: string;
};

const PASSWORD_PROVIDER = "password";

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConvexError(`${field} is required`);
  }
  return value.trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function generateInviteCode(ctx: AuthMutationCtx): Promise<string> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Use Web Crypto API for random bytes
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    const code = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");

    const existing = await ctx.db
      .query("businessAccounts")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
      .first();

    if (!existing) {
      return code;
    }
  }
}

function buildProfile(params: Record<string, unknown>): ProfileParams {
  const flow = typeof params.flow === "string" ? params.flow : "";
  const email = normalizeEmail(assertString(params.email, "email"));
  const profile: ProfileParams = { email };

  let firstName = typeof params.firstName === "string" ? params.firstName.trim() : undefined;
  let lastName = typeof params.lastName === "string" ? params.lastName.trim() : undefined;

  const inviteCode = typeof params.inviteCode === "string" ? params.inviteCode.trim() : undefined;

  if (flow === "signUp") {
    firstName = assertString(firstName, "firstName");
    lastName = assertString(lastName, "lastName");
    if (!inviteCode) {
      profile.businessName = assertString(params.businessName, "businessName");
    }
  }

  if (firstName) {
    profile.firstName = firstName;
  }

  if (lastName) {
    profile.lastName = lastName;
  }

  const derivedName = [firstName, lastName].filter(Boolean).join(" ");
  if (derivedName) {
    profile.name = derivedName;
  }

  if (inviteCode) {
    profile.inviteCode = inviteCode;
  }

  return profile;
}

const passwordProvider = Password({
  profile: (params: Record<string, unknown>) => buildProfile(params),
  reset: Email({
    id: "password-reset",
    sendVerificationRequest: async ({
      identifier,
      code,
      url,
      expires,
    }: {
      identifier: string;
      code: string;
      url: string | null;
      expires: Date | null;
    }) =>
      sendPasswordResetEmail({
        identifier,
        code,
        url: url ?? undefined,
        expires: expires ?? undefined,
      }),
  }),
});

async function createOrUpdateUser(ctx: AuthMutationCtx, args: CreateOrUpdateUserArgs) {
  if (args.provider.id !== PASSWORD_PROVIDER) {
    throw new ConvexError("Unsupported authentication provider");
  }

  const now = Date.now();
  const profile = args.profile as ProfileParams;
  const email = normalizeEmail(assertString(profile.email, "email"));

  if (args.existingUserId) {
    const existingUser = await ctx.db.get(args.existingUserId);
    if (!existingUser) {
      throw new ConvexError("User not found");
    }

    const updates: Record<string, unknown> = {
      updatedAt: now,
      status: "active" satisfies UserStatus,
    };

    if (profile.firstName) {
      updates.firstName = profile.firstName;
    }
    if (profile.lastName) {
      updates.lastName = profile.lastName;
    }
    if (profile.name) {
      updates.name = profile.name;
    }

    if (existingUser.email !== email) {
      updates.email = email;
    }

    await ctx.db.patch(args.existingUserId, updates);
    return args.existingUserId;
  }

  const firstName = assertString(profile.firstName, "firstName");
  const lastName = assertString(profile.lastName, "lastName");
  const name = profile.name ?? `${firstName} ${lastName}`.trim();

  let businessAccountId: string;
  let role: Role = "owner";

  if (profile.inviteCode) {
    const account = await ctx.db
      .query("businessAccounts")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", profile.inviteCode!))
      .unique();

    if (!account) {
      throw new ConvexError("Invite code not found");
    }

    if (!account.ownerUserId) {
      throw new ConvexError("Business account is not fully provisioned");
    }

    businessAccountId = account._id;
    role = "manager";
  } else {
    const businessName = assertString(profile.businessName, "businessName");
    const inviteCode = await generateInviteCode(ctx);
    businessAccountId = await ctx.db.insert("businessAccounts", {
      name: businessName,
      inviteCode,
      createdAt: now,
    });
  }

  const userId = await ctx.db.insert("users", {
    email,
    name,
    firstName,
    lastName,
    businessAccountId,
    role,
    status: "active" satisfies UserStatus,
    createdAt: now,
    updatedAt: now,
  });

  if (role === "owner") {
    await ctx.db.patch(businessAccountId as any, {
      ownerUserId: userId,
    });
  }

  return userId;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => createOrUpdateUser(ctx, args),
  },
});
