import type Stripe from "stripe";
import { fulfillCheckout } from "@/lib/license";
import { checkoutPlan, sessionIsPaid, stripe } from "@/lib/stripe";
import { findLicenseBySubscription, updateLicense } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response("Stripe is not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    // async_payment_succeeded covers delayed methods (bank debits): the session completes first, money arrives later.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const plan = checkoutPlan(session);
      if (plan && sessionIsPaid(session)) {
        fulfillCheckout({
          sessionId: session.id,
          email: session.customer_details?.email ?? session.customer_email ?? "unknown",
          plan,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const license = findLicenseBySubscription(sub.id);
      if (license) updateLicense(license.key, { status: "canceled" });
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const license = findLicenseBySubscription(sub.id);
      if (license) {
        const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
        updateLicense(license.key, { status: active ? "active" : "canceled" });
      }
      break;
    }
    default:
      break;
  }
  return new Response(null, { status: 200 });
}
