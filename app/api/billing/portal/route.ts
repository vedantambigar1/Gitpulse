import { SITE } from "@/lib/config";
import { authLicense } from "@/lib/license";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Pro: opens the Stripe Customer Portal so the customer can cancel, update a card or download invoices.
 * The portal must be activated once in the Stripe dashboard (Settings > Billing > Customer portal).
 */
export async function POST(req: Request) {
  if (!rateLimit(`portal:${clientIp(req)}`, 10)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const license = authLicense(req);
  if (!license) return Response.json({ error: "A valid private dashboard key for an active Pro license is required" }, { status: 401 });

  const s = stripe();
  if (!s) return Response.json({ error: "Billing is not configured" }, { status: 503 });
  if (!license.stripeCustomerId) {
    return Response.json({ error: "No billing account is linked to this license. Contact support if you need help." }, { status: 400 });
  }

  try {
    const session = await s.billingPortal.sessions.create({
      customer: license.stripeCustomerId,
      return_url: `${SITE.url}/dashboard`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[gitpulse] billing portal error:", err);
    return Response.json({ error: "The billing portal is unavailable right now. Please try again or contact support." }, { status: 502 });
  }
}
