import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import type { BillingPlan, BillingSource } from "@/lib/billing";

type RevenueCatWebhook = {
  api_version?: string;
  event?: RevenueCatEvent;
};

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  aliases?: string[];
  store?: string;
  product_id?: string;
  entitlement_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  expiration_at_ms?: number | string | null;
  purchased_at_ms?: number | string | null;
  environment?: string;
};

function textFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function msToIso(value: unknown): string | null {
  const ms = typeof value === "string" ? Number(value) : value;
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function billingSourceFromStore(store: string | null): BillingSource {
  const normalized = store?.toLowerCase() ?? "";
  if (normalized.includes("app_store") || normalized.includes("mac_app_store")) return "apple";
  if (normalized.includes("play_store") || normalized.includes("google")) return "google";
  if (normalized.includes("stripe")) return "stripe";
  return "free";
}

function planFromRevenueCat(event: RevenueCatEvent, status: string): BillingPlan {
  if (status === "expired" || status === "canceled") return "free";
  if (event.period_type?.toLowerCase() === "trial") return "trial";

  const haystack = [
    event.entitlement_id,
    ...(Array.isArray(event.entitlement_ids) ? event.entitlement_ids : []),
    event.product_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("business")) return "business";
  if (haystack.includes("test")) return "test";
  return "pro";
}

function intervalFromProduct(productId: string | null) {
  const normalized = productId?.toLowerCase() ?? "";
  return normalized.includes("year") || normalized.includes("annual") ? "year" : "month";
}

function statusFromEvent(event: RevenueCatEvent) {
  const type = event.type?.toUpperCase() ?? "";
  const periodType = event.period_type?.toLowerCase();

  if (type === "TEST") return "test";
  if (type === "EXPIRATION") return "expired";
  if (type === "BILLING_ISSUE") return "past_due";
  if (type === "CANCELLATION") return "active";
  if (periodType === "trial") return "trialing";

  if (
    [
      "INITIAL_PURCHASE",
      "RENEWAL",
      "UNCANCELLATION",
      "PRODUCT_CHANGE",
      "SUBSCRIPTION_EXTENDED",
      "NON_RENEWING_PURCHASE",
      "TEMPORARY_ENTITLEMENT_GRANT",
    ].includes(type)
  ) {
    return "active";
  }

  return "active";
}

function assertRevenueCatAuth(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  if (!expected) return;

  const actual = request.headers.get("authorization");
  if (actual !== expected) throw new Error("RevenueCat webhook authorization failed");
}

async function updateRevenueCatBilling(event: RevenueCatEvent) {
  const userId = textFrom(event.app_user_id);
  if (!userId) throw new Error("RevenueCat event missing app_user_id");

  const source = billingSourceFromStore(textFrom(event.store));
  if (source !== "apple" && source !== "google" && source !== "stripe") {
    throw new Error(`Unsupported RevenueCat store: ${event.store ?? "unknown"}`);
  }

  const { data, error: loadError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (loadError) throw new Error(loadError.message);
  if (!data.user) throw new Error("RevenueCat event did not match a Supabase user");

  const status = statusFromEvent(event);
  const periodEnd = msToIso(event.expiration_at_ms);
  const productId = textFrom(event.product_id);
  const graceEndsAt =
    status === "past_due"
      ? (periodEnd ?? textFrom(data.user.app_metadata?.grace_period_ends_at) ?? addDaysIso(7))
      : null;

  const metadata = {
    ...(data.user.app_metadata ?? {}),
    billing_source: source,
    billing_status: status,
    billing_interval: intervalFromProduct(productId),
    current_period_end: periodEnd,
    grace_period_ends_at: graceEndsAt,
    trial_ends_at: status === "trialing" ? periodEnd : null,
    plan: planFromRevenueCat(event, status),
    plan_updated_at: new Date().toISOString(),
    store_subscription_status: status,
    store_product_id: productId,
    store_original_transaction_id: textFrom(event.original_transaction_id),
    store_transaction_id: textFrom(event.transaction_id),
    store_current_period_end: periodEnd,
    store_grace_period_ends_at: graceEndsAt,
    store_cancel_at_period_end: event.type?.toUpperCase() === "CANCELLATION",
    revenuecat_app_user_id: userId,
    revenuecat_environment: textFrom(event.environment),
    revenuecat_last_event_type: textFrom(event.type),
    revenuecat_last_event_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  });
  if (error) throw new Error(error.message);
}

export const Route = createFileRoute("/api/revenuecat/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertRevenueCatAuth(request);
          const payload = (await request.json()) as RevenueCatWebhook;
          const event = payload.event;
          if (!event) throw new Error("Missing RevenueCat event");

          if (event.type?.toUpperCase() !== "TEST") {
            await updateRevenueCatBilling(event);
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error("RevenueCat webhook failed", error);
          return Response.json({ error: (error as Error).message }, { status: 400 });
        }
      },
    },
  },
});
