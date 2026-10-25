import { clientIp, rateLimit } from "@/lib/ratelimit";
import { LIMITS } from "@/lib/config";
import { USERNAME_RE } from "@/lib/github";
import { verifyKey } from "@/lib/license";

/** Used by the studio to confirm a key before it is put into an embed snippet. Does not claim a username slot. */
export async function POST(req: Request) {
  if (!rateLimit(`verify:${clientIp(req)}`, 30)) return Response.json({ error: "Too many requests" }, { status: 429 });
  let body: { key?: unknown; username?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  } catch {
    return Response.json({ valid: false, reason: "unknown" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const username = typeof body.username === "string" && USERNAME_RE.test(body.username) ? body.username : "";
  if (!key) return Response.json({ valid: false, reason: "unknown" });

  const r = verifyKey(key, username || "a", { bind: false });
  return Response.json({
    valid: r.valid,
    reason: r.reason,
    plan: r.license?.plan,
    slotsLeft: r.license ? Math.max(0, LIMITS.maxUsernamesPerLicense - r.license.usernames.length) : undefined,
  });
}
