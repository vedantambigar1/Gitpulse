import crypto from "node:crypto";
import { LIMITS, PLANS, SITE, type PlanId } from "@/lib/config";
import { fulfillCheckout } from "@/lib/license";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { stripe } from "@/lib/stripe";

/**
 * Starts checkout. With Stripe configured it returns a hosted Checkout URL.
 * Without Stripe, and only when ALLOW_DEMO_CHECKOUT=1 outside production, it issues a
 * license instantly so the whole flow can be tried locally.
 */
export async function POST(req: Request) {
  if (!rateLimit(`checkout:${clientIp(req)}`, LIMITS.rateCheckout)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  let body: { plan?: unknown; email?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.plan !== "monthly" && body.plan !== "lifetime") {
    return Response.json({ error: "Unknown plan" }, { status: 400 });
  }
  const planId = body.plan as PlanId;
  const plan = PLANS[planId];
  if (!plan) return Response.json({ error: "Unknown plan" }, { status: 400 });
  const email = typeof body.email === "string" && /^\S+@\S+\.\S+$/.test(body.email) ? body.email : undefined;

  const s = stripe();
  const priceId = process.env[plan.priceEnv];

  if (s && priceId) {
    const session = await s.checkout.sessions.create({
      mode: plan.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      metadata: { plan: plan.id },
      ...(plan.mode === "subscription"
        ? { subscription_data: { metadata: { plan: plan.id } } }
        : { customer_creation: "always" as const }), // one-time buyers get a Stripe customer too (invoices, support)
      success_url: `${SITE.url}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE.url}/#pricing`,
    });
    return Response.json({ url: session.url });
  }

  const demoAllowed = process.env.ALLOW_DEMO_CHECKOUT === "1" && process.env.NODE_ENV !== "production";
  if (demoAllowed) {
    const sessionId = `demo_${crypto.randomBytes(10).toString("hex")}`;
    fulfillCheckout({ sessionId, email: email ?? "demo@example.com", plan: plan.id });
    return Response.json({ url: `/success?session_id=${sessionId}&demo=1` });
  }

  return Response.json(
    { error: "Payments are not configured yet. Set STRIPE_SECRET_KEY and the price ids." },
    { status: 503 }
  );
}
