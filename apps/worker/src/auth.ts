import { telegramLoginUserSchema } from "@personal-agent/shared";
import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqual,
  hmacSha256,
  sha256,
  toHex
} from "./crypto.js";
import { type AdminSessionUser } from "./types.js";

const sessionCookieName = "pa_admin_session";
const sessionTtlSeconds = 8 * 60 * 60;
const telegramLoginMaxAgeSeconds = 10 * 60;

export function getSessionCookieName(): string {
  return sessionCookieName;
}

export async function verifyTelegramLogin(input: {
  query: URLSearchParams;
  botToken: string;
  now?: number;
}): Promise<AdminSessionUser | null> {
  const raw = Object.fromEntries(input.query.entries());
  const parsed = telegramLoginUserSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const checkPairs = Array.from(input.query.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right));
  const dataCheckString = checkPairs
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await sha256(input.botToken);
  const expectedHash = toHex(
    await hmacSha256({
      key: secretKey,
      data: dataCheckString
    })
  );

  if (!constantTimeEqual(expectedHash, parsed.data.hash)) {
    return null;
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);

  if (
    parsed.data.auth_date > now ||
    now - parsed.data.auth_date > telegramLoginMaxAgeSeconds
  ) {
    return null;
  }

  return {
    id: parsed.data.id,
    username: parsed.data.username,
    firstName: parsed.data.first_name,
    photoUrl: parsed.data.photo_url
  };
}

export async function signSession(input: {
  user: AdminSessionUser;
  secret: string;
  now?: number;
}): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const payload = {
    user: input.user,
    exp: now + sessionTtlSeconds
  };
  const payloadText = JSON.stringify(payload);
  const payloadPart = base64UrlEncode(new TextEncoder().encode(payloadText));
  const signaturePart = base64UrlEncode(
    await hmacSha256({
      key: new TextEncoder().encode(input.secret),
      data: payloadPart
    })
  );

  return `${payloadPart}.${signaturePart}`;
}

export async function verifySession(input: {
  cookieValue: string | null;
  secret: string;
  now?: number;
}): Promise<AdminSessionUser | null> {
  if (!input.cookieValue) {
    return null;
  }

  const [payloadPart, signaturePart] = input.cookieValue.split(".");

  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = base64UrlEncode(
    await hmacSha256({
      key: new TextEncoder().encode(input.secret),
      data: payloadPart
    })
  );

  if (!constantTimeEqual(expectedSignature, signaturePart)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadPart))
    ) as { user?: AdminSessionUser; exp?: number };
    const now = input.now ?? Math.floor(Date.now() / 1000);

    if (!payload.user || typeof payload.exp !== "number" || payload.exp < now) {
      return null;
    }

    return payload.user;
  } catch {
    return null;
  }
}

export function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export function buildSessionCookie(input: {
  value: string;
  maxAgeSeconds?: number;
}): string {
  return [
    `${sessionCookieName}=${encodeURIComponent(input.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${input.maxAgeSeconds ?? sessionTtlSeconds}`
  ].join("; ");
}

export function buildExpiredSessionCookie(): string {
  return [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0"
  ].join("; ");
}
