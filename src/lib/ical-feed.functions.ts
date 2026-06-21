import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { syncIcalFeed, type IcalPlatform } from "@/lib/ical-sync.server";

const ICAL_PLATFORMS = ["booksy", "fresha", "vagaro"] as const;

async function getUserId(): Promise<string> {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Not authenticated");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid session");
  return data.user.id;
}

async function getUserIdOrNull(): Promise<string | null> {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

const connectSchema = z.object({
  platform: z.enum(ICAL_PLATFORMS),
  feedUrl: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((v) => /^https?:\/\//i.test(v) || /^webcal:\/\//i.test(v), {
      message: "Must be a valid http(s) or webcal URL",
    }),
});

function normalizeFeedUrl(url: string): string {
  // Convert webcal:// → https:// per the de-facto convention used by Booksy / Fresha.
  return url.replace(/^webcal:\/\//i, "https://");
}

export const connectIcalFeed = createServerFn({ method: "POST" })
  .inputValidator((input) => connectSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const feedUrl = normalizeFeedUrl(data.feedUrl);

    // Upsert the feed row first.
    const { data: row, error } = await supabaseAdmin
      .from("ical_feeds")
      .upsert(
        {
          user_id: userId,
          platform: data.platform,
          feed_url: feedUrl,
          last_error: null,
          consecutive_failures: 0,
        },
        { onConflict: "user_id,platform" },
      )
      .select("id, user_id, platform, feed_url, consecutive_failures")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to save feed");

    // Run an immediate sync so the user sees events appear right away.
    const result = await syncIcalFeed({
      id: row.id as string,
      user_id: row.user_id as string,
      platform: row.platform as string,
      feed_url: row.feed_url as string,
      consecutive_failures: (row.consecutive_failures as number | null) ?? 0,
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Initial sync failed — check the URL");
    }
    return { ok: true, synced: result.synced, platform: data.platform };
  });

export const disconnectIcalFeed = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ platform: z.enum(ICAL_PLATFORMS) }).parse(input),
  )
  .handler(async ({ data }) => {
    const userId = await getUserId();
    // Delete the feed.
    const { error: delErr } = await supabaseAdmin
      .from("ical_feeds")
      .delete()
      .eq("user_id", userId)
      .eq("platform", data.platform);
    if (delErr) throw new Error(delErr.message);

    // Also drop appointments sourced from this feed.
    await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("user_id", userId)
      .eq("source_platform", data.platform);

    return { ok: true };
  });

export const listIcalFeeds = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await getUserId();
    const { data, error } = await supabaseAdmin
      .from("ical_feeds")
      .select("platform, feed_url, last_synced_at, last_error, consecutive_failures")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const feeds = (data ?? []).map((r) => ({
      platform: r.platform as IcalPlatform,
      feedUrl: r.feed_url as string,
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      consecutiveFailures: (r.consecutive_failures as number | null) ?? 0,
    }));
    return { feeds };
  },
);

export const refreshIcalFeed = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ platform: z.enum(ICAL_PLATFORMS) }).parse(input),
  )
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const { data: row, error } = await supabaseAdmin
      .from("ical_feeds")
      .select("id, user_id, platform, feed_url, consecutive_failures")
      .eq("user_id", userId)
      .eq("platform", data.platform)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("No feed configured");
    const result = await syncIcalFeed({
      id: row.id as string,
      user_id: row.user_id as string,
      platform: row.platform as string,
      feed_url: row.feed_url as string,
      consecutive_failures: (row.consecutive_failures as number | null) ?? 0,
    });
    if (!result.ok) throw new Error(result.error ?? "Sync failed");
    return { ok: true, synced: result.synced };
  });
