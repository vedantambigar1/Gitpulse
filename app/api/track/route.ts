import crypto from "node:crypto";
import { LIMITS } from "@/lib/config";
import { appSecret } from "@/lib/secret";
import { USERNAME_RE } from "@/lib/github";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { recordView } from "@/lib/store";

/**
 * Privacy-friendly view counter. Visitors are identified by a salted hash that
 * rotates daily, so nothing personal is stored and nobody can be followed across days.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`track:${ip}`, LIMITS.rateTrack)) return new Response(null, { status: 429 });

  let body: { u?: unknown; ref?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  } catch {
    return new Response(null, { status: 400 });
  }
  const u = typeof body.u === "string" ? body.u : "";
  if (!USERNAME_RE.test(u)) return new Response(null, { status: 400 });

  let referrer = "direct";
  if (typeof body.ref === "string" && body.ref) {
    try {
      const host = new URL(body.ref).hostname.replace(/^www\./, "");
      const own = req.headers.get("host")?.split(":")[0];
      if (host && host !== own) referrer = host.slice(0, 80);
    } catch {
      /* ignore malformed referrers */
    }
  }

  const day = new Date().toISOString().slice(0, 10);
  const ua = req.headers.get("user-agent") ?? "";
  const visitor = crypto.createHash("sha256").update(`${appSecret()}|${day}|${ip}|${ua}`).digest("hex").slice(0, 16);

  recordView(u, visitor, referrer);
  return new Response(null, { status: 204 });
}
