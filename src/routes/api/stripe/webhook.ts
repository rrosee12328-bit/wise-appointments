import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { stripeInternals } from "@/lib/stripe.functions";

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function textFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberToIso(value: unknown): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(payload: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Stripe webhook secret is not configured");
  if (!signatureHeader) throw new Error("Missing Stripe signature");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) throw new Error("Malformed Stripe signature");

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe signature timestamp is outside tolerance");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  if (hex(digest) !== expected) throw new Error("Stripe signature verification failed");
}

async function findUserIdByStripeCustomer(customerId: string | null) {
  if (!customerId) return null;

  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => user.app_metadata?.stripe_customer_id === customerId);
    if (found) return found.id;
    if (data.users.length < perPage) return null;
    page++;
  }
}

async function fetchSubscription(subscriptionId: string | null) {
  if (!subscriptionId) return null;
  return stripeInternals.stripeRequest<Record<string, unknown>>(
    `/subscriptions/${subscriptionId}?expand[]=items.data.price`,
    { method: "GET" },
  );
}

function subscriptionMetadata(subscription: Record<string, unknown> | null) {
  const items =
    subscription &&
    typeof subscription.items === "object" &&
    subscription.items !== null &&
    "data" in subscription.items &&
    Array.isArray(subscription.items.data)
      ? subscription.items.data
      : [];
  const firstItem = items[0] as Record<string, unknown> | undefined;
  const price =
    firstItem && typeof firstItem.price === "object" && firstItem.price !== null
      ? (firstItem.price as Record<string, unknown>)
      : null;

  const status = textFrom(subscription?.status);
  return {
    stripe_subscription_id: textFrom(subscription?.id),
    stripe_subscription_status: status,
    stripe_current_period_end: numberToIso(subscription?.current_period_end),
    stripe_price_id: textFrom(price?.id),
    plan: stripeInternals.planFromStatus(status),
    plan_updated_at: new Date().toISOString(),
  };
}

async function updateUserBilling(
  userId: string,
  billingMetadata: Record<string, unknown>,
  customerId?: string | null,
) {
  const { data, error: loadError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (loadError) throw new Error(loadError.message);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(data.user.app_metadata ?? {}),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      ...billingMetadata,
    },
  });
  if (error) throw new Error(error.message);
}

async function handleCheckoutCompleted(session: Record<string, unknown>) {
  const userId =
    textFrom(session.client_reference_id) ??
    (typeof session.metadata === "object" && session.metadata !== null
      ? textFrom((session.metadata as Record<string, unknown>).supabase_user_id)
      : null);
  if (!userId) throw new Error("Checkout session missing Supabase user id");

  const customerId = textFrom(session.customer);
  const subscriptionId = textFrom(session.subscription);
  const subscription = await fetchSubscription(subscriptionId);
  await updateUserBilling(userId, subscriptionMetadata(subscription), customerId);
}

async function handleSubscriptionChanged(subscription: Record<string, unknown>) {
  const customerId = textFrom(subscription.customer);
  const metadataUserId =
    typeof subscription.metadata === "object" && subscription.metadata !== null
      ? textFrom((subscription.metadata as Record<string, unknown>).supabase_user_id)
      : null;
  const userId = metadataUserId ?? (await findUserIdByStripeCustomer(customerId));
  if (!userId) throw new Error("Subscription event missing matching Supabase user");
  await updateUserBilling(userId, subscriptionMetadata(subscription), customerId);
}

async function handleInvoicePaymentFailed(invoice: Record<string, unknown>) {
  const customerId = textFrom(invoice.customer);
  const userId = await findUserIdByStripeCustomer(customerId);
  if (!userId) return;
  await updateUserBilling(
    userId,
    {
      stripe_subscription_status: "past_due",
      plan: "free",
      plan_updated_at: new Date().toISOString(),
    },
    customerId,
  );
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text();
        try {
          await verifyStripeSignature(payload, request.headers.get("stripe-signature"));
          const event = JSON.parse(payload) as StripeEvent;

          switch (event.type) {
            case "checkout.session.completed":
              await handleCheckoutCompleted(event.data.object);
              break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
              await handleSubscriptionChanged(event.data.object);
              break;
            case "invoice.payment_failed":
              await handleInvoicePaymentFailed(event.data.object);
              break;
            case "invoice.payment_succeeded": {
              const subscription = await fetchSubscription(
                textFrom(event.data.object.subscription),
              );
              if (subscription) await handleSubscriptionChanged(subscription);
              break;
            }
            default:
              break;
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error("Stripe webhook failed", error);
          return Response.json({ error: (error as Error).message }, { status: 400 });
        }
      },
    },
  },
});
