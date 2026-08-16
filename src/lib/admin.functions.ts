import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";
import { syncGoogleCalendarForUser } from "@/lib/google-sync.functions";
import { syncOutlookCalendarForUser } from "@/lib/outlook-sync.functions";
import { syncSquareBookingsForUser } from "@/lib/square-sync.functions";
import { syncCalendlyEventsForUser } from "@/lib/calendly-sync.functions";
import { syncAcuityAppointmentsForUser } from "@/lib/acuity-sync.functions";
import { syncZohoBookingsForUser } from "@/lib/zoho-sync.functions";
import { syncIcalFeed } from "@/lib/ical-sync.server";
import { syncAppointmentBlocksForUser } from "@/lib/appointment-writeback.functions";
import { hasPaidAccess } from "@/lib/billing";

type Metadata = Record<string, unknown>;

type ProfileRow = {
  id: string;
  display_name: string | null;
  business_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  timezone?: string | null;
  created_at: string | null;
};

type ConnectionRow = {
  user_id: string;
  platform: string;
  status: string | null;
  account_label: string | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
  metadata: Metadata | null;
  created_at: string | null;
  updated_at: string | null;
};

type IcalFeedRow = {
  id: string;
  user_id: string;
  platform: string;
  feed_url: string;
  last_synced_at: string | null;
  last_error: string | null;
  consecutive_failures: number | null;
  created_at: string | null;
};

type AppointmentRow = {
  id: string;
  user_id: string;
  source_platform: string;
  client_name: string;
  service: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string | null;
};

function textFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function inviteRedirectUrl(host: string) {
  const configuredOrigin = process.env.INVITE_REDIRECT_ORIGIN;
  if (configuredOrigin) return `${configuredOrigin.replace(/\/$/, "")}/reset-password`;

  const isLocal = host.includes("localhost");
  const origin = isLocal ? `http://${host}` : "https://jeylink.vektiss.com";
  return `${origin}/reset-password`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

function findConflictIds(rows: AppointmentRow[]) {
  const ids = new Set<string>();
  const byUser = new Map<string, AppointmentRow[]>();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  for (const userRows of byUser.values()) {
    const sorted = [...userRows].sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = new Date(sorted[i].ends_at).getTime();
      const nextStart = new Date(sorted[i + 1].starts_at).getTime();
      if (Number.isFinite(currentEnd) && Number.isFinite(nextStart) && nextStart < currentEnd) {
        ids.add(sorted[i].id);
        ids.add(sorted[i + 1].id);
      }
    }
  }
  return ids;
}

async function requireAdminUser() {
  const user = await requireUser();
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
  return user;
}

async function listAllAuthUsers() {
  const users: User[] = [];
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page++;
  }

  return users;
}

export const getAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminUser();

  const [authUsers, profilesRes, rolesRes, connectionsRes, feedsRes, appointmentsRes] =
    await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin
        .from("profiles")
        .select(
          "id, display_name, business_name, first_name, last_name, phone, timezone, created_at",
        ),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin
        .from("platform_connections")
        .select(
          "user_id, platform, status, account_label, token_expires_at, last_synced_at, metadata, created_at, updated_at",
        ),
      supabaseAdmin
        .from("ical_feeds")
        .select(
          "id, user_id, platform, feed_url, last_synced_at, last_error, consecutive_failures, created_at",
        ),
      supabaseAdmin
        .from("appointments")
        .select(
          "id, user_id, source_platform, client_name, service, starts_at, ends_at, created_at",
        )
        .order("starts_at", { ascending: false })
        .limit(10000),
    ]);

  for (const res of [profilesRes, rolesRes, connectionsRes, feedsRes, appointmentsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).reduce(
    (map, row) => map.set(row.id, row),
    new Map<string, ProfileRow>(),
  );
  const adminIds = new Set(
    ((rolesRes.data ?? []) as { user_id: string; role: string }[])
      .filter((row) => row.role === "admin")
      .map((row) => row.user_id),
  );
  const connections = (connectionsRes.data ?? []) as ConnectionRow[];
  const feeds = (feedsRes.data ?? []) as IcalFeedRow[];
  const appointments = (appointmentsRes.data ?? []) as AppointmentRow[];
  const conflictIds = findConflictIds(appointments);
  const nowIso = new Date().toISOString();

  const connectionsByUser = new Map<string, ConnectionRow[]>();
  for (const conn of connections) {
    if (!connectionsByUser.has(conn.user_id)) connectionsByUser.set(conn.user_id, []);
    connectionsByUser.get(conn.user_id)!.push(conn);
  }

  const feedsByUser = new Map<string, IcalFeedRow[]>();
  for (const feed of feeds) {
    if (!feedsByUser.has(feed.user_id)) feedsByUser.set(feed.user_id, []);
    feedsByUser.get(feed.user_id)!.push(feed);
  }

  const appointmentsByUser = new Map<string, AppointmentRow[]>();
  for (const appt of appointments) {
    if (!appointmentsByUser.has(appt.user_id)) appointmentsByUser.set(appt.user_id, []);
    appointmentsByUser.get(appt.user_id)!.push(appt);
  }

  const platformCounts = new Map<string, number>();
  for (const conn of connections) {
    platformCounts.set(conn.platform, (platformCounts.get(conn.platform) ?? 0) + 1);
  }
  for (const feed of feeds) {
    platformCounts.set(feed.platform, (platformCounts.get(feed.platform) ?? 0) + 1);
  }

  const appointmentCounts = new Map<string, number>();
  for (const appt of appointments) {
    appointmentCounts.set(
      appt.source_platform,
      (appointmentCounts.get(appt.source_platform) ?? 0) + 1,
    );
  }

  const users = authUsers.map((authUser) => {
    const profile = profiles.get(authUser.id);
    const userConnections = connectionsByUser.get(authUser.id) ?? [];
    const userFeeds = feedsByUser.get(authUser.id) ?? [];
    const userAppointments = appointmentsByUser.get(authUser.id) ?? [];
    const firstName = textFrom(profile?.first_name);
    const lastName = textFrom(profile?.last_name);
    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      textFrom(profile?.display_name) ||
      textFrom(authUser.user_metadata?.full_name) ||
      authUser.email ||
      "Unknown user";
    const platformRows = [
      ...userConnections.map((conn) => {
        const syncError = textFrom(conn.metadata?.sync_error);
        const syncErrorAt = textFrom(conn.metadata?.sync_error_at);
        const expiresInDays = daysUntil(conn.token_expires_at);
        return {
          platform: conn.platform,
          accountLabel: conn.account_label,
          status: conn.status ?? "unknown",
          tokenExpiresAt: conn.token_expires_at,
          expiresInDays,
          isExpired: expiresInDays !== null && expiresInDays < 0,
          lastSyncedAt: conn.last_synced_at,
          lastSyncAgeDays: daysSince(conn.last_synced_at),
          syncError,
          syncErrorAt,
          updatedAt: conn.updated_at,
        };
      }),
      ...userFeeds.map((feed) => ({
        platform: feed.platform,
        accountLabel: "iCal feed",
        status: feed.last_error ? "error" : "connected",
        tokenExpiresAt: null,
        expiresInDays: null,
        isExpired: false,
        lastSyncedAt: feed.last_synced_at,
        lastSyncAgeDays: daysSince(feed.last_synced_at),
        syncError: feed.last_error,
        syncErrorAt: null,
        updatedAt: feed.created_at,
      })),
    ];
    const syncErrors = platformRows
      .filter((platform) => platform.syncError)
      .map((platform) => `${platform.platform}: ${platform.syncError}`);
    const lastSyncedAt =
      platformRows
        .map((platform) => platform.lastSyncedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    const rawPlan = textFrom(authUser.app_metadata?.plan) ?? "free";
    const plan = rawPlan === "paid" ? "pro" : rawPlan;
    const stripeSubscriptionStatus = textFrom(authUser.app_metadata?.stripe_subscription_status);
    const stripeGracePeriodEndsAt = textFrom(authUser.app_metadata?.stripe_grace_period_ends_at);

    return {
      id: authUser.id,
      email: authUser.email ?? null,
      displayName,
      businessName: profile?.business_name ?? null,
      createdAt: authUser.created_at ?? profile?.created_at ?? null,
      lastSignInAt: authUser.last_sign_in_at ?? null,
      bannedUntil: authUser.banned_until ?? null,
      isAdmin: adminIds.has(authUser.id),
      plan,
      billingInterval: textFrom(authUser.app_metadata?.billing_interval),
      hasPaidAccess: hasPaidAccess(plan, stripeSubscriptionStatus, stripeGracePeriodEndsAt),
      paymentWarning: stripeSubscriptionStatus === "past_due",
      stripeCustomerId: textFrom(authUser.app_metadata?.stripe_customer_id),
      stripeSubscriptionId: textFrom(authUser.app_metadata?.stripe_subscription_id),
      stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: textFrom(authUser.app_metadata?.stripe_current_period_end),
      stripeCancelAtPeriodEnd: authUser.app_metadata?.stripe_cancel_at_period_end === true,
      stripeGracePeriodEndsAt,
      stripePriceId: textFrom(authUser.app_metadata?.stripe_price_id),
      planUpdatedAt: textFrom(authUser.app_metadata?.plan_updated_at),
      platforms: platformRows,
      platformCount: platformRows.length,
      lastSyncedAt,
      syncErrors,
      appointmentCount: userAppointments.length,
      upcomingAppointmentCount: userAppointments.filter((appt) => appt.ends_at >= nowIso).length,
      conflictCount: userAppointments.filter((appt) => conflictIds.has(appt.id)).length,
      appointments: userAppointments
        .slice()
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        .slice(0, 100),
    };
  });

  const brokenConnections = users.flatMap((user) =>
    user.platforms
      .filter(
        (platform) => platform.isExpired || platform.status !== "connected" || platform.syncError,
      )
      .map((platform) => ({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        ...platform,
        expiredForDays: platform.isExpired ? Math.abs(platform.expiresInDays ?? 0) : null,
      })),
  );

  const googleAccessBlocked = brokenConnections.filter((conn) => {
    const text = `${conn.platform} ${conn.syncError ?? ""}`.toLowerCase();
    return (
      conn.platform === "google_calendar" &&
      (text.includes("access blocked") || text.includes("test user"))
    );
  });

  return {
    users,
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter((user) => !user.bannedUntil).length,
      totalAppointments: appointments.length,
      paidUsers: users.filter((user) => user.hasPaidAccess).length,
      upcomingAppointments: appointments.filter((appt) => appt.ends_at >= nowIso).length,
      conflictCount: conflictIds.size,
      platformCounts: Array.from(platformCounts.entries()).map(([platform, count]) => ({
        platform,
        count,
      })),
      appointmentCounts: Array.from(appointmentCounts.entries()).map(([platform, count]) => ({
        platform,
        count,
      })),
      brokenConnectionCount: brokenConnections.length,
      googleAccessBlockedCount: googleAccessBlocked.length,
    },
    health: {
      brokenConnections,
      googleAccessBlocked,
    },
  };
});

const userIdSchema = z.object({ userId: z.string().uuid() });

export const adminInviteUser = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdminUser();
    const email = data.email.trim().toLowerCase();
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirectUrl(getRequestHost()),
      data: {
        invited_by: admin.email ?? admin.id,
        invited_at: new Date().toISOString(),
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true, email, userId: invited.user?.id ?? null };
  });

export const adminSyncUser = createServerFn({ method: "POST" })
  .inputValidator((input) => userIdSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdminUser();

    const { data: feeds, error: feedsError } = await supabaseAdmin
      .from("ical_feeds")
      .select("id, user_id, platform, feed_url, consecutive_failures")
      .eq("user_id", data.userId);
    if (feedsError) throw new Error(feedsError.message);

    const tasks = [
      { platform: "google_calendar", run: () => syncGoogleCalendarForUser(data.userId) },
      { platform: "outlook_calendar", run: () => syncOutlookCalendarForUser(data.userId) },
      { platform: "square", run: () => syncSquareBookingsForUser(data.userId) },
      { platform: "calendly", run: () => syncCalendlyEventsForUser(data.userId) },
      { platform: "acuity", run: () => syncAcuityAppointmentsForUser(data.userId) },
      { platform: "zoho", run: () => syncZohoBookingsForUser(data.userId) },
      { platform: "busy_blocks", run: () => syncAppointmentBlocksForUser(data.userId) },
      ...((feeds ?? []) as IcalFeedRow[]).map((feed) => ({
        platform: feed.platform,
        run: () =>
          syncIcalFeed({
            id: feed.id,
            user_id: feed.user_id,
            platform: feed.platform,
            feed_url: feed.feed_url,
            consecutive_failures: feed.consecutive_failures ?? 0,
          }),
      })),
    ];

    const settled = await Promise.allSettled(tasks.map((task) => task.run()));
    const results = settled.map((result, index) => ({
      platform: tasks[index].platform,
      ok: result.status === "fulfilled",
      result: result.status === "fulfilled" ? result.value : null,
      error: result.status === "rejected" ? (result.reason as Error).message : null,
    }));

    return { ok: results.some((result) => result.ok), results };
  });

export const adminClearSyncState = createServerFn({ method: "POST" })
  .inputValidator((input) => userIdSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { data: rows, error } = await supabaseAdmin
      .from("platform_connections")
      .select("platform, metadata")
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    await Promise.all(
      ((rows ?? []) as { platform: string; metadata: Metadata | null }[]).map((row) =>
        supabaseAdmin
          .from("platform_connections")
          .update({
            status: "connected",
            metadata: {
              ...(row.metadata ?? {}),
              sync_error: null,
              sync_error_at: null,
              admin_cleared_at: new Date().toISOString(),
            },
          })
          .eq("user_id", data.userId)
          .eq("platform", row.platform),
      ),
    );

    await supabaseAdmin
      .from("ical_feeds")
      .update({ last_error: null, consecutive_failures: 0 })
      .eq("user_id", data.userId);

    return { ok: true };
  });

export const adminDeactivateUser = createServerFn({ method: "POST" })
  .inputValidator((input) => userIdSchema.extend({ deactivate: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdminUser();
    if (admin.id === data.userId) throw new Error("You cannot deactivate your own admin account");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.deactivate ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((input) => userIdSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdminUser();
    if (admin.id === data.userId) throw new Error("You cannot delete your own admin account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetUserPlan = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    userIdSchema
      .extend({ plan: z.enum(["free", "pro", "business", "trial", "internal"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { data: userData, error: loadError } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (loadError) throw new Error(loadError.message);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      app_metadata: {
        ...(userData.user.app_metadata ?? {}),
        plan: data.plan,
        plan_updated_at: new Date().toISOString(),
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
