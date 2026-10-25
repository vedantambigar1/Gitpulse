import crypto from "node:crypto";
import { LIMITS } from "./config";
import { USERNAME_RE } from "./github";
import { appSecret, safeEqual } from "./secret";
import { createLicense, findLicenseBySession, getLicense, updateLicense } from "./store";
import type { License, Plan } from "./types";

export const KEY_RE = /^gp_[a-f0-9]{24}$/;

export interface VerifyResult {
  valid: boolean;
  reason?: "unknown" | "inactive" | "limit";
  license?: License;
}

/**
 * Checks that a key is active and may be used for this username.
 * With bind=true the first use of a username claims one of the license's slots,
 * which stops a single key from being shared across dozens of sites.
 */
export function verifyKey(key: string, username: string, opts: { bind?: boolean } = {}): VerifyResult {
  const { bind = true } = opts;
  if (!USERNAME_RE.test(username)) return { valid: false, reason: "unknown" };
  if (!KEY_RE.test(key)) return { valid: false, reason: "unknown" };
  const license = getLicense(key);
  if (!license) return { valid: false, reason: "unknown" };
  if (license.status !== "active") return { valid: false, reason: "inactive", license };

  const u = username.toLowerCase();
  if (license.usernames.includes(u)) return { valid: true, license };
  if (license.usernames.length >= LIMITS.maxUsernamesPerLicense) return { valid: false, reason: "limit", license };
  if (!bind) return { valid: true, license };
  const updated = updateLicense(key, { usernames: [...license.usernames, u] });
  return { valid: true, license: updated };
}

/** Private dashboard credential. Never include this in a widget or public API response. */
export function managementKey(key: string): string {
  const signature = crypto.createHmac("sha256", appSecret()).update(`management:${key}`).digest("hex");
  return `gpm_${key.slice(3)}_${signature}`;
}

export function authLicense(req: Request): License | undefined {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const match = /^gpm_([a-f0-9]{24})_[a-f0-9]{64}$/.exec(token);
  if (!match) return undefined;
  const key = `gp_${match[1]}`;
  if (!safeEqual(token, managementKey(key))) return undefined;
  const license = getLicense(key);
  return license && license.status === "active" ? license : undefined;
}

/** Idempotent: returns the existing license when the same checkout session is fulfilled twice. */
export function fulfillCheckout(input: {
  sessionId: string;
  email: string;
  plan: Plan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}): License {
  return findLicenseBySession(input.sessionId) ?? createLicense(input);
}
