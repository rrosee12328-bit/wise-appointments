import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  display_name: string | null;
  business_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  email: string | null;
};

const SELECT = "id, first_name, last_name, phone, display_name, business_name, avatar_url, timezone";

export const getProfile = createServerFn({ method: "GET" })
  .handler(async (): Promise<Profile> => {
    const user = await requireUser();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaFirst = typeof meta.first_name === "string" ? (meta.first_name as string) : null;
    const metaLast = typeof meta.last_name === "string" ? (meta.last_name as string) : null;
    const metaPhone = typeof meta.phone === "string" ? (meta.phone as string) : null;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(SELECT)
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      const inserted = await supabaseAdmin
        .from("profiles")
        .insert({
          id: user.id,
          first_name: metaFirst,
          last_name: metaLast,
          phone: metaPhone,
          display_name: [metaFirst, metaLast].filter(Boolean).join(" ") || user.email,
        })
        .select(SELECT)
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      return { ...inserted.data, email: user.email ?? null } as Profile;
    }
    return { ...data, email: user.email ?? null } as Profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      first_name: z.string().trim().min(1).max(60).optional().nullable(),
      last_name: z.string().trim().min(1).max(60).optional().nullable(),
      phone: z.string().trim().max(32).optional().nullable(),
      business_name: z.string().max(120).optional().nullable(),
      timezone: z.string().max(64).optional().nullable(),
      avatar_url: z.string().url().max(1024).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const patch: Record<string, unknown> = { ...data };
    if ("first_name" in data || "last_name" in data) {
      const { data: current } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
      const fn = (data.first_name ?? current?.first_name ?? "").trim();
      const ln = (data.last_name ?? current?.last_name ?? "").trim();
      const combined = `${fn} ${ln}`.trim();
      if (combined) patch.display_name = combined;
    }
    const { data: result, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return result;
  });
