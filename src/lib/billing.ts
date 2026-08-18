export type BillingPlan = "free" | "pro" | "business" | "test" | "trial" | "internal";
export type BillingInterval = "month" | "year";
export type PaidBillingPlan = "pro" | "business" | "test";
export type BillingSource = "free" | "stripe" | "apple" | "google" | "internal";

export type BillingStatus = {
  plan: BillingPlan;
  billingSource: BillingSource;
  billingStatus: string | null;
  billingInterval: BillingInterval | null;
  hasPaidAccess: boolean;
  paymentWarning: boolean;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  stripeGracePeriodEndsAt: string | null;
  stripePriceId: string | null;
  storeSubscriptionStatus: string | null;
  storeProductId: string | null;
  storeOriginalTransactionId: string | null;
  storeCurrentPeriodEnd: string | null;
  revenuecatAppUserId: string | null;
  planUpdatedAt: string | null;
};

export function isPaidPlan(plan: string | null | undefined) {
  return (
    plan === "pro" ||
    plan === "business" ||
    plan === "test" ||
    plan === "trial" ||
    plan === "internal" ||
    plan === "paid"
  );
}

export function gracePeriodActive(gracePeriodEndsAt: string | null | undefined) {
  if (!gracePeriodEndsAt) return false;
  const graceEnd = new Date(gracePeriodEndsAt).getTime();
  return Number.isFinite(graceEnd) && graceEnd > Date.now();
}

export function hasPaidAccess(
  plan: string | null | undefined,
  subscriptionStatus?: string | null,
  gracePeriodEndsAt?: string | null,
) {
  if (plan === "internal") return true;
  if (!isPaidPlan(plan)) return false;
  if (!subscriptionStatus) return true;
  if (["active", "trialing"].includes(subscriptionStatus)) return true;
  if (subscriptionStatus === "past_due") return gracePeriodActive(gracePeriodEndsAt);
  return false;
}

export function billingSourceLabel(source: string | null | undefined) {
  switch (source) {
    case "stripe":
      return "Stripe";
    case "apple":
      return "Apple";
    case "google":
      return "Google Play";
    case "internal":
      return "Internal";
    default:
      return "Free";
  }
}

export function planLabel(plan: string | null | undefined) {
  switch (plan) {
    case "pro":
    case "paid":
      return "Pro";
    case "business":
      return "Business";
    case "test":
      return "Test";
    case "trial":
      return "Pro trial";
    case "internal":
      return "Internal";
    default:
      return "Free";
  }
}
