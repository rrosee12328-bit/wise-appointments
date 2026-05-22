import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";

export type Profile = {
  id: string;
  display_name: string | null;
  business_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  email: string | null;
};

export const getProfile = createServerFn({ method: "GET" })
  .handler(async (): Promise<Profile> => {
    const user = await requireUser();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, business_name, avatar_url, timezone")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      // First-time: create row defensively in case the trigger didn't fire
      const inserted = await supabaseAdmin
        .from("profiles")
        .insert({ id: user.id, display_name: user.email })
        .select("id, display_name, business_name, avatar_url, timezone")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      return { ...inserted.data, email: user.email ?? null } as Profile;
    }
    return { ...data, email: user.email ?? null } as Profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      display_name: z.string().min(1).max(120).optional(),
      business_name: z.string().max(120).optional().nullable(),
      timezone: z.string().max(64).optional().nullable(),
      avatar_url: z.string().url().max(1024).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { data: result, error } = await supabaseAdmin
      .from("profiles")
      .update(data)
      .eq("id", user.id)
      .select("id, display_name, business_name, avatar_url, timezone")
      .single();
    if (error) throw new Error(error.message);
    return result;
  });
