export type BillingPlan = "free" | "paid" | "trial" | "internal";

export type BillingStatus = {
  plan: BillingPlan;
  hasPaidAccess: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripePriceId: string | null;
  planUpdatedAt: string | null;
};

export function isPaidPlan(plan: string | null | undefined) {
  return plan === "paid" || plan === "trial" || plan === "internal";
}

export function hasPaidAccess(plan: string | null | undefined, subscriptionStatus?: string | null) {
  if (plan === "internal") return true;
  if (!isPaidPlan(plan)) return false;
  if (!subscriptionStatus) return true;
  return ["active", "trialing"].includes(subscriptionStatus);
}
