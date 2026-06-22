import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";

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
