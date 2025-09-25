import { ConvexError } from "convex/values";

import { getAuthEmailFromAddress, getResendApiKey } from "./env";

type ResetEmailPayload = {
  identifier: string;
  code: string;
  url?: string;
  expires?: Date | number | string;
};

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

const buildResetEmailContent = ({
  code,
  url,
  expires,
}: Pick<ResetEmailPayload, "code" | "url" | "expires">) => {
  const expiration = expires ? new Date(expires).toLocaleString() : null;
  const header = `<h1 style="margin:0 0 16px;font-size:20px;font-weight:600;font-family:Inter,Helvetica,Arial,sans-serif">Reset your BrickOps password</h1>`;
  const copy = `<p style="margin:0 0 16px;font-size:14px;font-family:Inter,Helvetica,Arial,sans-serif">Use the verification code below to finish resetting your password.</p>`;
  const codeBlock = `<p style="margin:0 0 16px;font-size:18px;font-family:Menlo,Consolas,monospace;letter-spacing:4px;font-weight:600">${code}</p>`;
  const expiresCopy = expiration
    ? `<p style="margin:0 0 16px;font-size:12px;color:#6b7280;font-family:Inter,Helvetica,Arial,sans-serif">This code expires on ${expiration}.</p>`
    : "";
  const linkCopy = url
    ? `<p style="margin:0 0 16px;font-size:14px;font-family:Inter,Helvetica,Arial,sans-serif">If you prefer, you can finish the reset by visiting <a style="color:#2563eb" href="${url}">this link</a>.</p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background-color:#f9fafb;color:#111827">${header}${copy}${codeBlock}${linkCopy}${expiresCopy}<p style="margin:32px 0 0;font-size:12px;color:#6b7280;font-family:Inter,Helvetica,Arial,sans-serif">If you did not request this reset, you can ignore this email.</p></body></html>`;

  const textLines = ["Reset your BrickOps password", "", `Verification code: ${code}`];
  if (url) {
    textLines.push("Reset link:", url);
  }
  if (expiration) {
    textLines.push("", `Expires: ${expiration}`);
  }
  textLines.push("", "If you did not request this reset, you can ignore this email.");

  return { html, text: textLines.join("\n") };
};

export const sendPasswordResetEmail = async ({
  identifier,
  code,
  url,
  expires,
}: ResetEmailPayload): Promise<void> => {
  const to = identifier.trim().toLowerCase();
  if (!to) {
    throw new ConvexError("Password reset email requires a recipient");
  }

  const apiKey = getResendApiKey();
  const from = getAuthEmailFromAddress();
  const { html, text } = buildResetEmailContent({ code, url, expires });

  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "BrickOps password reset",
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[auth] Failed to send password reset email", {
      status: response.status,
      detail,
    });
    throw new ConvexError("Unable to send password reset email");
  }
};

// Invite email support

type InviteEmailPayload = {
  to: string;
  inviteLink: string;
  invitedRole: "manager" | "picker" | "viewer";
};

const buildInviteEmailContent = ({ inviteLink, invitedRole }: Omit<InviteEmailPayload, "to">) => {
  const header = `<h1 style="margin:0 0 16px;font-size:20px;font-weight:600;font-family:Inter,Helvetica,Arial,sans-serif">You're invited to BrickOps</h1>`;
  const copy = `<p style="margin:0 0 16px;font-size:14px;font-family:Inter,Helvetica,Arial,sans-serif">You've been invited to join a BrickOps business account with the role: <strong>${invitedRole}</strong>.</p>`;
  const linkCopy = `<p style="margin:0 0 16px;font-size:14px;font-family:Inter,Helvetica,Arial,sans-serif">Click <a style="color:#2563eb" href="${inviteLink}">this link</a> to accept your invitation and finish setting up your account.</p>`;
  const footer = `<p style="margin:32px 0 0;font-size:12px;color:#6b7280;font-family:Inter,Helvetica,Arial,sans-serif">If you weren't expecting this, you can ignore this email.</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background-color:#f9fafb;color:#111827">${header}${copy}${linkCopy}${footer}</body></html>`;
  const text = [
    "You're invited to BrickOps",
    `Role: ${invitedRole}`,
    "",
    `Accept your invite: ${inviteLink}`,
  ].join("\n");
  return { html, text };
};

export const sendInviteEmail = async ({ to, inviteLink, invitedRole }: InviteEmailPayload) => {
  const recipient = to.trim().toLowerCase();
  if (!recipient) {
    throw new ConvexError("Invite email requires a recipient");
  }

  const apiKey = getResendApiKey();
  const from = getAuthEmailFromAddress();
  const { html, text } = buildInviteEmailContent({ inviteLink, invitedRole });

  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: "You're invited to BrickOps",
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[auth] Failed to send invite email", {
      status: response.status,
      detail,
    });
    throw new ConvexError("Unable to send invite email");
  }
};
