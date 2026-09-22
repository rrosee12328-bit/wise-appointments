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
  onboarding_completed_at: string | null;
  email: string | null;
};

const SELECT =
  "id, first_name, last_name, phone, display_name, business_name, avatar_url, timezone, onboarding_completed_at";

export type OnboardingStatus = {
  completed: boolean;
  completedAt: string | null;
};

export const getOnboardingStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<OnboardingStatus> => {
    const user = await requireUser();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const completedAt = data?.onboarding_completed_at ?? null;
    return { completed: Boolean(completedAt), completedAt };
  },
);

export const completeOnboarding = createServerFn({ method: "POST" }).handler(
  async (): Promise<OnboardingStatus> => {
    const user = await requireUser();
    const completedAt = new Date().toISOString();
    const updated = await supabaseAdmin
      .from("profiles")
      .update({ onboarding_completed_at: completedAt })
      .eq("id", user.id)
      .select("onboarding_completed_at")
      .maybeSingle();

    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const firstName = typeof meta.first_name === "string" ? meta.first_name : null;
      const lastName = typeof meta.last_name === "string" ? meta.last_name : null;
      const displayName = [firstName, lastName].filter(Boolean).join(" ") || user.email;
      const inserted = await supabaseAdmin.from("profiles").insert({
        id: user.id,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        onboarding_completed_at: completedAt,
      });

      if (inserted.error) throw new Error(inserted.error.message);
    }
    return { completed: true, completedAt };
  },
);

export const getProfile = createServerFn({ method: "GET" }).handler(async (): Promise<Profile> => {
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
    z
      .object({
        first_name: z.string().trim().min(1).max(60).optional().nullable(),
        last_name: z.string().trim().min(1).max(60).optional().nullable(),
        phone: z.string().trim().max(32).optional().nullable(),
        business_name: z.string().max(120).optional().nullable(),
        timezone: z.string().max(64).optional().nullable(),
        avatar_url: z.string().url().max(1024).optional().nullable(),
      })
      .parse(input),
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

export const deleteAccount = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  const userTables = [
    "appointments",
    "platform_connections",
    "platform_links",
    "ical_feeds",
    "user_roles",
  ] as const;

  for (const table of userTables) {
    const { error } = await supabaseAdmin.from(table).delete().eq("user_id", user.id);
    if (error) throw new Error(`Unable to delete ${table}: ${error.message}`);
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", user.id);
  if (profileError) throw new Error(`Unable to delete profile: ${profileError.message}`);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id, false);
  if (authError) throw new Error(authError.message);

  return { deleted: true };
});
