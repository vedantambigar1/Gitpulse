import Stripe from "stripe";
import type { Plan } from "./types";

const g = globalThis as unknown as { __gpStripe?: Stripe };

/** A checkout counts as paid only when money has actually been collected (or nothing was due, e.g. a 100% coupon). */
export function sessionIsPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

/** Ignore other products' sessions on a shared Stripe account. */
export function checkoutPlan(session: Stripe.Checkout.Session): Plan | undefined {
  const plan = session.metadata?.plan;
  if (plan === "monthly" && session.mode === "subscription") return plan;
  if (plan === "lifetime" && session.mode === "payment") return plan;
  return undefined;
}

/** Returns a Stripe client, or null when STRIPE_SECRET_KEY is not configured. */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return (g.__gpStripe ??= new Stripe(key));
}
