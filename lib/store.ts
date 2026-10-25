/**
 * Tiny JSON-file store. It keeps v1 dependency-free and is plenty for a few thousand
 * licenses. To scale out, replace the functions below with Postgres/Redis/KV calls;
 * nothing else in the codebase touches the file directly.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DayStat, DomainMapping, License } from "./types";

interface DB {
  licenses: Record<string, License>;
  stats: Record<string, Record<string, DayStat>>; // username -> yyyy-mm-dd -> stat
}

const DIR = path.resolve(process.env.DATA_DIR ?? "./.data");
const FILE = path.join(DIR, "db.json");

const g = globalThis as unknown as { __gpDb?: DB; __gpTimer?: ReturnType<typeof setTimeout> };

function loadFromDisk(): DB {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<DB>;
    return { licenses: parsed.licenses ?? {}, stats: parsed.stats ?? {} };
  } catch {
    return { licenses: {}, stats: {} };
  }
}

function db(): DB {
  return (g.__gpDb ??= loadFromDisk());
}

function persist() {
  if (g.__gpTimer) clearTimeout(g.__gpTimer);
  g.__gpTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db()));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.error("[gitpulse] could not write store:", err);
    }
  }, 200);
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- licenses

export function getLicense(key: string): License | undefined {
  return db().licenses[key];
}

export function findLicenseBySession(sessionId: string): License | undefined {
  return Object.values(db().licenses).find((l) => l.sessionId === sessionId);
}

export function findLicenseBySubscription(subscriptionId: string): License | undefined {
  return Object.values(db().licenses).find((l) => l.stripeSubscriptionId === subscriptionId);
}

export function findLicensesByEmail(email: string): License[] {
  const e = email.trim().toLowerCase();
  return Object.values(db().licenses).filter((l) => l.email.toLowerCase() === e);
}

export function createLicense(input: Omit<License, "key" | "createdAt" | "usernames" | "domains" | "status">): License {
  let key = "";
  do {
    key = `gp_${crypto.randomBytes(12).toString("hex")}`;
  } while (db().licenses[key]);
  const license: License = {
    ...input,
    key,
    status: "active",
    usernames: [],
    domains: [],
    createdAt: new Date().toISOString(),
  };
  db().licenses[key] = license;
  persist();
  return license;
}

export function updateLicense(key: string, patch: Partial<License>): License | undefined {
  const cur = db().licenses[key];
  if (!cur) return undefined;
  Object.assign(cur, patch);
  persist();
  return cur;
}

// ----------------------------------------------------------------- domains

/** Returns the active license that owns a VERIFIED mapping for this host. Unverified claims never match. */
export function findDomain(host: string): { license: License; mapping: DomainMapping } | undefined {
  for (const license of Object.values(db().licenses)) {
    if (license.status !== "active") continue;
    const mapping = license.domains.find((d) => d.host === host && d.verified === true);
    if (mapping) return { license, mapping };
  }
  return undefined;
}

// --------------------------------------------------------------- analytics

export function recordView(username: string, visitor: string, referrer: string) {
  const u = username.toLowerCase();
  const stats = Object.hasOwn(db().stats, u) ? db().stats[u] : (db().stats[u] = {});
  const day = today();
  let s = stats[day];
  if (!s) {
    s = stats[day] = { views: 0, visitors: [], referrers: {} };
    // Prune anything older than ~13 months whenever a new day starts.
    const cutoff = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    for (const d of Object.keys(stats)) if (d < cutoff) delete stats[d];
  }
  s.views++;
  if (s.visitors.length < 3000 && !s.visitors.includes(visitor)) s.visitors.push(visitor);
  const ref = Object.keys(s.referrers).length >= 50 && !Object.hasOwn(s.referrers, referrer) ? "other" : referrer;
  const count = Object.hasOwn(s.referrers, ref) ? s.referrers[ref] : 0;
  Object.defineProperty(s.referrers, ref, { value: count + 1, writable: true, enumerable: true, configurable: true });
  persist();
}

export interface UsernameStats {
  username: string;
  days: { date: string; views: number; uniques: number }[];
  totals: { views: number; uniques: number };
  referrers: { host: string; views: number }[];
}

export function getStats(username: string, days: number): UsernameStats {
  const u = username.toLowerCase();
  const stats = Object.hasOwn(db().stats, u) ? db().stats[u] : {};
  const out: UsernameStats["days"] = [];
  const refs = new Map<string, number>();
  const unique = new Set<string>();
  let views = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const s = stats[date];
    out.push({ date, views: s?.views ?? 0, uniques: s?.visitors.length ?? 0 });
    if (s) {
      views += s.views;
      s.visitors.forEach((v) => unique.add(`${date}:${v}`));
      for (const [h, n] of Object.entries(s.referrers)) refs.set(h, (refs.get(h) ?? 0) + n);
    }
  }
  return {
    username: u,
    days: out,
    totals: { views, uniques: out.reduce((a, d) => a + d.uniques, 0) },
    referrers: [...refs.entries()]
      .map(([host, n]) => ({ host, views: n }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
  };
}
