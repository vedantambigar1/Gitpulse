import { managementKey } from "@/lib/license";
import { SITE } from "@/lib/config";
import { emailConfigured, sendEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { findLicensesByEmail } from "@/lib/store";

export const runtime = "nodejs";

const HOUR = 3_600_000;

/**
 * Lost key? Emails every active key bought with this address to that same address.
 * The response never reveals whether the address has a license, so it cannot be used to probe customers.
 */
export async function POST(req: Request) {
  if (!rateLimit(`recover:ip:${clientIp(req)}`, 5, HOUR)) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });

  let body: { email?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return Response.json({ error: "Enter a valid email address" }, { status: 400 });

  if (!emailConfigured()) {
    return Response.json({ error: "Key recovery by email is not available yet. Please contact support." }, { status: 503 });
  }

  // At most two emails per address per hour; extra requests look identical to successful ones.
  if (!rateLimit(`recover:email:${email}`, 2, HOUR)) return Response.json({ ok: true });

  const licenses = findLicensesByEmail(email).filter((l) => l.status === "active");
  if (licenses.length > 0) {
    try {
      await sendEmail({
        to: email,
        subject: `Your ${SITE.name} license key`,
        text: [
          `Here ${licenses.length === 1 ? "is your" : "are your"} ${SITE.name} Pro license key${licenses.length === 1 ? "" : "s"}:`,
          "",
          ...licenses.flatMap((l) => [
            `Widget license key: ${l.key}  (${l.plan})`,
            `Private dashboard key: ${managementKey(l.key)}`,
            "Keep the dashboard key private; never put it in an embed.",
            "",
          ]),
          "",
          `Open your dashboard: ${SITE.url}/dashboard`,
          "",
          "If you did not ask for this email you can ignore it. Your keys have not been shared with anyone.",
        ].join("\n"),
      });
    } catch (err) {
      console.error("[gitpulse] could not send recovery email:", err);
    }
  }
  return Response.json({ ok: true });
}
