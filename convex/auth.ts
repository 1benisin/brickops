import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import type { GenericMutationCtx } from "convex/server";
import { ConvexError } from "convex/values";
import { checkAndConsumeRateLimitDirect } from "./lib/dbRateLimiter";
import type { DataModel, Id } from "./_generated/dataModel";

import { sendPasswordResetEmail } from "./lib/external/email";

type Role = "owner" | "manager" | "picker" | "viewer";
type UserStatus = "active" | "invited";

type CreateOrUpdateUserArgs = {
  existingUserId: Id<"users"> | null;
  provider: { id: string };
  profile: Record<string, unknown>;
  shouldLink?: boolean;
};

type AuthMutationCtx = GenericMutationCtx<DataModel>;

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
  const rawInviteToken =
    typeof (params as { inviteToken?: unknown }).inviteToken === "string"
      ? (params as { inviteToken?: string }).inviteToken!.trim()
      : undefined;

  if (flow === "signUp") {
    firstName = assertString(firstName, "firstName");
    lastName = assertString(lastName, "lastName");
    if (!inviteCode) {
      profile.businessName = assertString(params.businessName as string, "businessName");
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

  if (rawInviteToken) {
    (profile as ProfileParams & { inviteToken?: string }).inviteToken = rawInviteToken;
  } else if (inviteCode) {
    profile.inviteCode = inviteCode;
  }

  return profile;
}

const passwordProvider = Password({
  profile: (params: Record<string, unknown>) => buildProfile(params),
  reset: Email({
    id: "password-reset",
    sendVerificationRequest: async (params) => {
      const { identifier, token, url, expires } = params as unknown as {
        identifier: string;
        token: string;
        url: string;
        expires: Date;
      };
      await sendPasswordResetEmail({
        identifier,
        code: token,
        url,
        expires,
      });
    },
  }),
});

async function createOrUpdateUser(ctx: AuthMutationCtx, args: CreateOrUpdateUserArgs) {
  if (args.provider.id !== PASSWORD_PROVIDER) {
    throw new ConvexError("Unsupported authentication provider");
  }

  const now = Date.now();
  const profile = args.profile as ProfileParams;
  const email = normalizeEmail(assertString(profile.email, "email"));

  // Check if a user with this email already exists
  const existingUserByEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  // If we have an existingUserId, use it (for sign-in or account linking)
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

  // If a user with this email already exists but wasn't linked, use that user
  if (existingUserByEmail) {
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

    await ctx.db.patch(existingUserByEmail._id, updates);
    return existingUserByEmail._id;
  }

  const firstName = assertString(profile.firstName, "firstName");
  const lastName = assertString(profile.lastName, "lastName");
  const name = profile.name ?? `${firstName} ${lastName}`.trim();

  let businessAccountId: Id<"businessAccounts">;
  let role: Role = "owner";

  const profWithToken = profile as ProfileParams & { inviteToken?: string };
  let usedInviteToken = false;
  if (profWithToken.inviteToken) {
    // Redeem explicit invite token → sets account and role from userInvites
    const token = profWithToken.inviteToken;
    // Rate limit by token to prevent brute-force redemption attempts
    const tokenKey = `token:${token}:invite_redeem`;
    const tokenLimit = await checkAndConsumeRateLimitDirect(ctx, {
      key: tokenKey,
      kind: "invite_redeem",
      limit: 5, // 5 attempts per hour per token
      windowMs: 60 * 60 * 1000,
    });
    if (!tokenLimit.allowed) {
      throw new ConvexError("Too many attempts. Please try again later.");
    }
    const invite = await ctx.db
      .query("userInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!invite) {
      throw new ConvexError("Invite not found");
    }
    if (invite.expiresAt < now) {
      throw new ConvexError("Invite has expired");
    }
    if (invite.redeemedAt) {
      throw new ConvexError("Invite already redeemed");
    }

    businessAccountId = invite.businessAccountId;
    role = invite.role as Role;

    await ctx.db.patch(invite._id, { redeemedAt: now });
    usedInviteToken = true;
  } else if (profile.inviteCode) {
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
    updatedAt: now,
  });

  if (usedInviteToken) {
    await ctx.db.insert("userAuditLogs", {
      businessAccountId,
      targetUserId: userId,
      action: "invite_redeemed",
      actorUserId: userId,
    });
  }

  if (role === "owner") {
    await ctx.db.patch(businessAccountId, {
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
