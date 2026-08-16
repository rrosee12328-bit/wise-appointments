export type BillingPlan = "free" | "pro" | "business" | "trial" | "internal";
export type BillingInterval = "month" | "year";
export type PaidBillingPlan = "pro" | "business";

export type BillingStatus = {
  plan: BillingPlan;
  billingInterval: BillingInterval | null;
  hasPaidAccess: boolean;
  paymentWarning: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  stripeGracePeriodEndsAt: string | null;
  stripePriceId: string | null;
  planUpdatedAt: string | null;
};

export function isPaidPlan(plan: string | null | undefined) {
  return (
    plan === "pro" ||
    plan === "business" ||
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

export function planLabel(plan: string | null | undefined) {
  switch (plan) {
    case "pro":
    case "paid":
      return "Pro";
    case "business":
      return "Business";
    case "trial":
      return "Pro trial";
    case "internal":
      return "Internal";
    default:
      return "Free";
  }
}
