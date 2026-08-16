import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";
import {
  gracePeriodActive,
  hasPaidAccess,
  type BillingInterval,
  type BillingPlan,
  type BillingStatus,
  type PaidBillingPlan,
} from "@/lib/billing";

type StripeJson = Record<string, unknown>;
type CheckoutSelection = { plan: PaidBillingPlan; interval: BillingInterval };

const checkoutSelectionSchema = z.object({
  plan: z.enum(["pro", "business"]).default("pro"),
  interval: z.enum(["month", "year"]).default("month"),
});

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  if (!/^[sr]k_(test|live)_/.test(key)) {
    throw new Error(
      "Stripe secret key is invalid. Use a full secret key from Stripe that starts with sk_live_, sk_test_, rk_live_, or rk_test_.",
    );
  }
  return key;
}

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function stripePriceId({ plan, interval }: CheckoutSelection) {
  const priceId =
    plan === "business"
      ? interval === "year"
        ? process.env.STRIPE_PRICE_ID_BUSINESS_YEARLY
        : process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY
      : interval === "year"
        ? process.env.STRIPE_PRICE_ID_PRO_YEARLY
        : (process.env.STRIPE_PRICE_ID_PRO_MONTHLY ??
          process.env.STRIPE_PRICE_ID_PRO ??
          process.env.STRIPE_PRICE_ID);
  if (!priceId) throw new Error(`Stripe ${plan} ${interval} price ID is not configured`);
  return priceId;
}

function appOrigin() {
  const configuredOrigin = process.env.APP_ORIGIN ?? process.env.INVITE_REDIRECT_ORIGIN;
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, "");

  const host = getRequestHost();
  return host.includes("localhost") ? `http://${host}` : "https://jeylink.vektiss.com";
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function boolFrom(value: unknown): boolean {
  return value === true || value === "true";
}

function safeStripeErrorMessage(message: string, status: number) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("api key expired") ||
    normalized.includes("expired api key")
  ) {
    return "Stripe secret key is invalid or expired. Update STRIPE_SECRET_KEY in the deployment environment with the full secret key from Stripe.";
  }
  if (normalized.includes("no such price")) {
    return "Stripe price ID was not found. Update STRIPE_PRICE_ID with a price from the same Stripe account as STRIPE_SECRET_KEY.";
  }
  return message || `Stripe request failed (${status})`;
}

function priceSelectionFromId(priceId: string | null): CheckoutSelection | null {
  const entries: Array<[CheckoutSelection, string | undefined]> = [
    [{ plan: "pro", interval: "month" }, process.env.STRIPE_PRICE_ID_PRO_MONTHLY],
    [{ plan: "pro", interval: "month" }, process.env.STRIPE_PRICE_ID_PRO],
    [{ plan: "pro", interval: "month" }, process.env.STRIPE_PRICE_ID],
    [{ plan: "pro", interval: "year" }, process.env.STRIPE_PRICE_ID_PRO_YEARLY],
    [{ plan: "business", interval: "month" }, process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY],
    [{ plan: "business", interval: "year" }, process.env.STRIPE_PRICE_ID_BUSINESS_YEARLY],
  ];
  return (
    entries.find(
      ([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId,
    )?.[0] ?? null
  );
}

function planFromSubscription(status: string | null, priceId: string | null): BillingPlan {
  if (status === "trialing") return "trial";
  if (status === "active" || status === "past_due")
    return priceSelectionFromId(priceId)?.plan ?? "pro";
  return "free";
}

function gracePeriodEndsAtFrom(metadata: Record<string, unknown> | null | undefined) {
  return stringFrom(metadata?.stripe_grace_period_ends_at);
}

function statusFromMetadata(metadata: Record<string, unknown> | null | undefined): BillingStatus {
  const rawPlan = stringFrom(metadata?.plan) ?? "free";
  const storedPlan = (rawPlan === "paid" ? "pro" : rawPlan) as BillingPlan;
  const stripeSubscriptionStatus = stringFrom(metadata?.stripe_subscription_status);
  const stripeGracePeriodEndsAt = gracePeriodEndsAtFrom(metadata);
  const plan =
    storedPlan !== "internal" &&
    (["canceled", "unpaid", "paused", "incomplete_expired"].includes(
      stripeSubscriptionStatus ?? "",
    ) ||
      (stripeSubscriptionStatus === "past_due" && !gracePeriodActive(stripeGracePeriodEndsAt)))
      ? "free"
      : storedPlan;
  return {
    plan,
    billingInterval: stringFrom(metadata?.billing_interval) as BillingInterval | null,
    hasPaidAccess: hasPaidAccess(plan, stripeSubscriptionStatus, stripeGracePeriodEndsAt),
    paymentWarning: stripeSubscriptionStatus === "past_due",
    stripeCustomerId: stringFrom(metadata?.stripe_customer_id),
    stripeSubscriptionId: stringFrom(metadata?.stripe_subscription_id),
    stripeSubscriptionStatus,
    stripeCurrentPeriodEnd: stringFrom(metadata?.stripe_current_period_end),
    stripeCancelAtPeriodEnd: boolFrom(metadata?.stripe_cancel_at_period_end),
    stripeGracePeriodEndsAt,
    stripePriceId: stringFrom(metadata?.stripe_price_id),
    planUpdatedAt: stringFrom(metadata?.plan_updated_at),
  };
}

async function stripeRequest<T extends StripeJson>(
  path: string,
  init: Omit<RequestInit, "headers" | "body"> & { body?: URLSearchParams } = {},
): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: init.body,
  });
  const json = (await res.json().catch(() => ({}))) as StripeJson;
  if (!res.ok) {
    const message =
      typeof json.error === "object" &&
      json.error !== null &&
      "message" in json.error &&
      typeof json.error.message === "string"
        ? json.error.message
        : `Stripe request failed (${res.status})`;
    throw new Error(safeStripeErrorMessage(message, res.status));
  }
  return json as T;
}

async function createCustomer(userId: string, email: string | null | undefined) {
  const body = new URLSearchParams();
  if (email) body.set("email", email);
  body.set("metadata[supabase_user_id]", userId);
  const customer = await stripeRequest<{ id: string }>("/customers", { method: "POST", body });
  return customer.id;
}

export const getBillingStatus = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return statusFromMetadata(user.app_metadata);
});

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input) => checkoutSelectionSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const current = statusFromMetadata(user.app_metadata);
    const origin = appOrigin();
    const priceId = stripePriceId(data);

    let customerId = current.stripeCustomerId;
    if (!customerId) {
      customerId = await createCustomer(user.id, user.email);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...(user.app_metadata ?? {}),
          stripe_customer_id: customerId,
        },
      });
      if (error) throw new Error(error.message);
    }

    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("customer", customerId);
    body.set("client_reference_id", user.id);
    body.set("success_url", `${origin}/settings?billing=success`);
    body.set("cancel_url", `${origin}/settings?billing=canceled`);
    body.set("allow_promotion_codes", "true");
    body.set("billing_address_collection", "auto");
    body.set("automatic_tax[enabled]", String(envFlag("STRIPE_AUTOMATIC_TAX_ENABLED", true)));
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    if (data.plan === "business") {
      body.set("tax_id_collection[enabled]", "true");
      body.set("tax_id_collection[required]", "if_supported");
    }
    body.set("metadata[supabase_user_id]", user.id);
    body.set("metadata[requested_plan]", data.plan);
    body.set("metadata[billing_interval]", data.interval);
    body.set("subscription_data[metadata][supabase_user_id]", user.id);
    body.set("subscription_data[metadata][requested_plan]", data.plan);
    body.set("subscription_data[metadata][billing_interval]", data.interval);
    if (data.plan === "pro" && !current.planUpdatedAt && envFlag("STRIPE_ENABLE_PRO_TRIAL", true)) {
      body.set("subscription_data[trial_period_days]", "14");
      body.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel");
    }

    const session = await stripeRequest<{ url?: string }>("/checkout/sessions", {
      method: "POST",
      body,
    });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return { url: session.url };
  });

export const createStripePortalSession = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  const current = statusFromMetadata(user.app_metadata);
  if (!current.stripeCustomerId) throw new Error("No Stripe customer found yet");

  const body = new URLSearchParams();
  body.set("customer", current.stripeCustomerId);
  body.set("return_url", `${appOrigin()}/settings`);

  const session = await stripeRequest<{ url?: string }>("/billing_portal/sessions", {
    method: "POST",
    body,
  });
  if (!session.url) throw new Error("Stripe did not return a Portal URL");
  return { url: session.url };
});

export const stripeInternals = {
  planFromSubscription,
  priceSelectionFromId,
  statusFromMetadata,
  stripeRequest,
};
