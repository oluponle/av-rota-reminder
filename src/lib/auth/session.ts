import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "av_admin_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getPassword(): string {
  const password = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (!password) {
    throw new Error("Missing ADMIN_DASHBOARD_PASSWORD environment variable.");
  }
  return password;
}

/** Constant-time string comparison -- avoids leaking a match/mismatch via
 *  response timing. (A length mismatch short-circuits before that, which
 *  only reveals string length, not content -- an accepted, standard
 *  simplification for a single-admin password gate.) */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function sign(expiry: number, password: string): string {
  return createHmac("sha256", password).update(String(expiry)).digest("hex");
}

/** Checks a submitted password against ADMIN_DASHBOARD_PASSWORD. Never
 *  returns or logs the password itself. */
export function verifyPassword(candidate: string): boolean {
  return safeEqual(candidate, getPassword());
}

/**
 * The session cookie never stores the password -- it's an expiry timestamp
 * plus an HMAC of that timestamp, keyed by the current
 * ADMIN_DASHBOARD_PASSWORD. Only someone who knows the password could have
 * produced a valid signature, so the cookie can't be forged, and changing
 * the password immediately invalidates every previously issued session.
 */
export async function createSession(): Promise<void> {
  const password = getPassword();
  const expiry = Date.now() + SESSION_DURATION_MS;
  const value = `${expiry}.${sign(expiry, password)}`;

  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

function isSessionValueValid(value: string | undefined): boolean {
  if (!value) return false;

  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const expiry = Number(value.slice(0, dotIndex));
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  let password: string;
  try {
    password = getPassword();
  } catch {
    return false;
  }

  return safeEqual(value.slice(dotIndex + 1), sign(expiry, password));
}

export async function hasValidSession(): Promise<boolean> {
  const store = await cookies();
  return isSessionValueValid(store.get(COOKIE_NAME)?.value);
}

/**
 * Throws if there's no valid admin session. Call this as the first line of
 * every dashboard/admin server action -- Server Actions are directly
 * callable network endpoints, so page-level UI gating alone would not stop
 * someone who knows (or guesses) the action from invoking it straight from
 * a script.
 */
export async function requireAdminSession(): Promise<void> {
  if (!(await hasValidSession())) {
    throw new Error("Unauthorized: an admin session is required.");
  }
}
