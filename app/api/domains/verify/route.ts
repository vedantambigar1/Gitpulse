import { HOST_RE, hasVerifyRecord, verifyRecordName, verifyRecordValue } from "@/lib/domains";
import { authLicense } from "@/lib/license";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { findDomain, updateLicense } from "@/lib/store";

export const runtime = "nodejs";

/** Pro: checks the DNS TXT record and, if it matches, marks the domain as verified so it starts serving. */
export async function POST(req: Request) {
  if (!rateLimit(`domain-verify:${clientIp(req)}`, 20)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const license = authLicense(req);
  if (!license) return Response.json({ error: "A valid private dashboard key for an active Pro license is required" }, { status: 401 });

  let body: { host?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const host = typeof body.host === "string" ? body.host.trim().toLowerCase() : "";
  if (!HOST_RE.test(host)) return Response.json({ error: "Invalid domain" }, { status: 400 });

  const mapping = license.domains.find((d) => d.host === host);
  if (!mapping) return Response.json({ error: "Add this domain first" }, { status: 404 });
  if (mapping.verified) return Response.json({ ok: true, verified: true });

  const owner = findDomain(host);
  if (owner && owner.license.key !== license.key) {
    return Response.json({ error: "That domain is already connected to another account" }, { status: 409 });
  }

  if (!(await hasVerifyRecord(license.key, host))) {
    return Response.json(
      {
        error: "We could not find the TXT record yet. DNS changes can take a few minutes, so try again shortly.",
        verify: { type: "TXT", name: verifyRecordName(host), value: verifyRecordValue(license.key, host) },
      },
      { status: 422 }
    );
  }

  // DNS is asynchronous: another account may have verified this host while we waited.
  const currentOwner = findDomain(host);
  if (currentOwner && currentOwner.license.key !== license.key) {
    return Response.json({ error: "That domain is already connected to another account" }, { status: 409 });
  }
  if (!license.domains.includes(mapping) || license.status !== "active") {
    return Response.json({ error: "The domain or license changed; try again" }, { status: 409 });
  }
  updateLicense(license.key, { domains: license.domains.map((d) => (d.host === host ? { ...d, verified: true } : d)) });
  return Response.json({ ok: true, verified: true });
}
