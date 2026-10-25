import { LIMITS, SITE } from "@/lib/config";
import { HOST_RE, verifyRecordName, verifyRecordValue } from "@/lib/domains";
import { authLicense } from "@/lib/license";
import { USERNAME_RE } from "@/lib/github";
import { appSecret, safeEqual } from "@/lib/secret";
import { findDomain, getLicense, updateLicense } from "@/lib/store";

function appHosts(): string[] {
  const own = (() => {
    try {
      return new URL(SITE.url).hostname;
    } catch {
      return "";
    }
  })();
  return [own, ...(process.env.APP_HOSTS ?? "").split(",")].map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/**
 * Pro: attach a custom domain that serves a widget page, e.g. activity.janedoe.dev.
 * The mapping starts unverified and is only served after the customer creates the TXT record
 * returned here and calls POST /api/domains/verify.
 */
export async function POST(req: Request) {
  const license = authLicense(req);
  if (!license) return Response.json({ error: "A valid private dashboard key for an active Pro license is required" }, { status: 401 });

  let body: { host?: unknown; username?: unknown; query?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const host = typeof body.host === "string" ? body.host.trim().toLowerCase() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const query = typeof body.query === "string" ? body.query.slice(0, 500) : "";

  if (!HOST_RE.test(host)) return Response.json({ error: "Enter a valid domain such as activity.example.com" }, { status: 400 });
  if (appHosts().includes(host)) return Response.json({ error: "That domain belongs to this app" }, { status: 400 });
  if (!USERNAME_RE.test(username)) return Response.json({ error: "Enter a valid GitHub username" }, { status: 400 });
  if (!license.usernames.includes(username.toLowerCase()) && license.usernames.length >= LIMITS.maxUsernamesPerLicense) {
    return Response.json({ error: `This license already covers ${LIMITS.maxUsernamesPerLicense} usernames` }, { status: 403 });
  }
  const taken = findDomain(host); // verified claims only
  if (taken && taken.license.key !== license.key) return Response.json({ error: "That domain is already connected to another account" }, { status: 409 });
  const previous = license.domains.find((d) => d.host === host);
  if (!previous && license.domains.length >= LIMITS.maxDomainsPerLicense) {
    return Response.json({ error: `You can connect up to ${LIMITS.maxDomainsPerLicense} domains` }, { status: 403 });
  }

  // The stored query carries the license key so the domain always renders Pro features.
  const params = new URLSearchParams(query);
  params.set("k", license.key);
  const mapping = { host, username, query: params.toString(), verified: previous?.verified ?? false };
  const domains = [...license.domains.filter((d) => d.host !== host), mapping];
  const usernames = license.usernames.includes(username.toLowerCase()) ? license.usernames : [...license.usernames, username.toLowerCase()];
  updateLicense(license.key, { domains, usernames });
  return Response.json({
    ok: true,
    host,
    username,
    verified: mapping.verified,
    verify: { type: "TXT", name: verifyRecordName(host), value: verifyRecordValue(license.key, host) },
  });
}

export async function DELETE(req: Request) {
  const license = authLicense(req);
  if (!license) return Response.json({ error: "A valid private dashboard key for an active Pro license is required" }, { status: 401 });
  const host = new URL(req.url).searchParams.get("host")?.toLowerCase() ?? "";
  updateLicense(license.key, { domains: license.domains.filter((d) => d.host !== host) });
  return Response.json({ ok: true });
}

/** Internal: the edge middleware asks this which widget a custom hostname should serve. */
export async function GET(req: Request) {
  if (!safeEqual(req.headers.get("x-internal-token") ?? "", appSecret())) return new Response(null, { status: 403 });
  const host = new URL(req.url).searchParams.get("host")?.toLowerCase() ?? "";
  const hit = findDomain(host);
  if (!hit || !getLicense(hit.license.key)) return new Response(null, { status: 404 });
  return Response.json({ username: hit.mapping.username, query: hit.mapping.query });
}
