import { fulfillCheckout, managementKey } from "@/lib/license";
import { checkoutPlan, sessionIsPaid, stripe } from "@/lib/stripe";
import { findLicenseBySession } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * The success page polls this with the Checkout session id to reveal the license key.
 * If the webhook has not arrived yet we confirm the payment with Stripe directly,
 * so customers never wait on webhook timing.
 */
export async function GET(req: Request) {
  if (!rateLimit(`session:${clientIp(req)}`, 40)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!/^[A-Za-z0-9_]{8,200}$/.test(sessionId)) return Response.json({ error: "Invalid session" }, { status: 400 });

  const reply = (license: NonNullable<ReturnType<typeof findLicenseBySession>>) => Response.json(
    { key: license.key, managementKey: managementKey(license.key), plan: license.plan, email: license.email },
    { headers: { "Cache-Control": "private, no-store" } }
  );
  const existing = findLicenseBySession(sessionId);
  if (existing) return reply(existing);

  const s = stripe();
  if (s && sessionId.startsWith("cs_")) {
    try {
      const session = await s.checkout.sessions.retrieve(sessionId);
      const plan = checkoutPlan(session);
      if (plan && sessionIsPaid(session)) {
        const license = fulfillCheckout({
          sessionId,
          email: session.customer_details?.email ?? session.customer_email ?? "unknown",
          plan,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
        });
        return reply(license);
      }
    } catch {
      /* fall through to pending */
    }
  }
  return Response.json({ pending: true }, { status: 404 });
}
