import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";
import { hasPaidAccess, type BillingPlan, type BillingStatus } from "@/lib/billing";

type StripeJson = Record<string, unknown>;

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key is not configured");
  return key;
}

function stripePriceId() {
  const priceId = process.env.STRIPE_PRICE_ID_PRO ?? process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("Stripe price ID is not configured");
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

function planFromStatus(status: string | null): BillingPlan {
  if (status === "trialing") return "trial";
  if (status === "active") return "paid";
  return "free";
}

function statusFromMetadata(metadata: Record<string, unknown> | null | undefined): BillingStatus {
  const plan = (stringFrom(metadata?.plan) ?? "free") as BillingPlan;
  const stripeSubscriptionStatus = stringFrom(metadata?.stripe_subscription_status);
  return {
    plan,
    hasPaidAccess: hasPaidAccess(plan, stripeSubscriptionStatus),
    stripeCustomerId: stringFrom(metadata?.stripe_customer_id),
    stripeSubscriptionId: stringFrom(metadata?.stripe_subscription_id),
    stripeSubscriptionStatus,
    stripeCurrentPeriodEnd: stringFrom(metadata?.stripe_current_period_end),
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
    throw new Error(message);
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

export const createStripeCheckoutSession = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  const current = statusFromMetadata(user.app_metadata);
  const origin = appOrigin();

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
  body.set("line_items[0][price]", stripePriceId());
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[supabase_user_id]", user.id);
  body.set("subscription_data[metadata][supabase_user_id]", user.id);

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
  planFromStatus,
  statusFromMetadata,
  stripeRequest,
};
