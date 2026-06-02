import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

const RELAY_PLATFORM_IDS = [
  "booksy",
  "thecut",
  "setmore",
  "squire",
  "vagaro",
  "barberly",
  "ringmybarber",
  "goldie",
  "glossgenius",
  "styleseat",
  "fresha",
  "mangomint",
  "boulevard",
  "simplybook",
] as const;

const linkSchema = z.object({
  platform: z.enum(RELAY_PLATFORM_IDS),
  handle: z.string().trim().min(1).max(200),
});

async function getUserId(): Promise<string> {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Not authenticated");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid session");
  return data.user.id;
}

function normalizeUrl(handle: string): string | null {
  const trimmed = handle.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && trimmed.includes("/")) return `https://${trimmed}`;
  return null;
}

export const linkPlatform = createServerFn({ method: "POST" })
  .inputValidator((input) => linkSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await getUserId();

    // Must have at least one relay calendar connected.
    const { data: relays } = await supabaseAdmin
      .from("platform_connections")
      .select("platform")
      .eq("user_id", userId)
      .in("platform", ["google_calendar", "outlook_calendar"]);

    const hasGoogle = relays?.some((r) => r.platform === "google_calendar");
    const hasOutlook = relays?.some((r) => r.platform === "outlook_calendar");
    if (!hasGoogle && !hasOutlook) {
      throw new Error(
        "Connect Google or Outlook Calendar first so bookings can flow through.",
      );
    }
    const relay = hasGoogle ? "google" : "outlook";
    const url = normalizeUrl(data.handle);

    const { error } = await supabaseAdmin
      .from("platform_links")
      .upsert(
        {
          user_id: userId,
          platform: data.platform,
          handle: data.handle.trim(),
          url,
          relay,
        },
        { onConflict: "user_id,platform" },
      );
    if (error) throw new Error(error.message);

    return { ok: true, handle: data.handle.trim(), relay };
  });

export const unlinkPlatform = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ platform: z.enum(RELAY_PLATFORM_IDS) }).parse(input),
  )
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const { error } = await supabaseAdmin
      .from("platform_links")
      .delete()
      .eq("user_id", userId)
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
