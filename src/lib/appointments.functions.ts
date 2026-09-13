import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";
import { hasPaidAccess } from "@/lib/billing";

export type AppointmentRow = {
  id: string;
  source_platform: string;
  client_name: string;
  service: string | null;
  starts_at: string;
  ends_at: string;
  is_block: boolean;
  note: string | null;
  external_url: string | null;
};

export const getAppointments = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: AppointmentRow[] }> => {
    const user = await requireUser();
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, source_platform, client_name, service, starts_at, ends_at, is_block, note, external_url",
      )
      .eq("user_id", user.id)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as AppointmentRow[] };
  },
);

export const upsertAppointment = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        source_platform: z.string().min(1).max(64),
        client_name: z.string().min(1).max(255),
        service: z.string().max(255).optional().nullable(),
        starts_at: z.string(),
        ends_at: z.string(),
        is_block: z.boolean().optional().default(false),
        note: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();

    const plan = user.app_metadata?.plan === "paid" ? "pro" : user.app_metadata?.plan;
    const paidAccess = hasPaidAccess(
      typeof plan === "string" ? plan : "free",
      typeof user.app_metadata?.stripe_subscription_status === "string"
        ? user.app_metadata.stripe_subscription_status
        : null,
      typeof user.app_metadata?.stripe_grace_period_ends_at === "string"
        ? user.app_metadata.stripe_grace_period_ends_at
        : null,
    );

    if (!paidAccess && !data.id) {
      const freeLimit = Number(process.env.FREE_MONTHLY_APPOINTMENT_LIMIT ?? 25);
      if (Number.isFinite(freeLimit) && freeLimit > 0) {
        const start = new Date(data.starts_at);
        const monthStart = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
        ).toISOString();
        const monthEnd = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
        ).toISOString();
        const { count, error: countError } = await supabaseAdmin
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("starts_at", monthStart)
          .lt("starts_at", monthEnd);
        if (countError) throw new Error(countError.message);
        if ((count ?? 0) >= freeLimit) {
          throw new Error(
            `Free plan is limited to ${freeLimit} appointments per month. Upgrade to Pro for unlimited appointments.`,
          );
        }
      }
    }

    const row = { ...data, user_id: user.id };
    const { data: result, error } = await supabaseAdmin
      .from("appointments")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { error } = await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
