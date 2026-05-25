import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

const CALENDLY_API_BASE = "https://api.calendly.com";

interface CalendlyEvent {
  uri: string;
  name: string | null;
  status: string;
  start_time: string;
  end_time: string;
  event_memberships?: Array<{
    user_name?: string;
    user_email?: string;
  }>;
  meeting_notes_plain?: string | null;
}

interface CalendlyInvitee {
  uri: string;
  name?: string;
  email?: string;
  status?: string;
}

class CalendlyReauthRequiredError extends Error {
  constructor(message = "Calendly reconnection required") {
    super(message);
    this.name = "CalendlyReauthRequiredError";
  }
}

async function refreshCalendlyToken(refreshToken: string): Promise<{
  access_token: string;
  expires_at: string;
}> {
  const res = await fetch("https://auth.calendly.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CALENDLY_OAUTH_CLIENT_ID!,
      client_secret: process.env.CALENDLY_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && text.includes("invalid_grant")) {
      throw new CalendlyReauthRequiredError();
    }
    throw new Error(`Calendly token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  return {
    access_token: data.access_token,
    expires_at: new Date(
      Date.now() + (data.expires_in ?? 7200) * 1000,
    ).toISOString(),
  };
}


export const syncCalendlyEvents = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");

    const userId = userData.user.id;

    // Load the Calendly connection for this user
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("platform_connections")
      .select("access_token, refresh_token, token_expires_at, metadata")
      .eq("user_id", userId)
      .eq("platform", "calendly")
      .maybeSingle();

    if (connErr) throw new Error(connErr.message);
    if (!conn) return { synced: 0, skipped: 0, connected: false };

    let accessToken = conn.access_token as string | null;
    const refreshToken = conn.refresh_token as string | null;
    const expiresAt = conn.token_expires_at
      ? new Date(conn.token_expires_at as string).getTime()
      : 0;

    // Refresh if expired or about to expire
    if (!accessToken || expiresAt - Date.now() < 60_000) {
      if (!refreshToken) {
        return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
      }
      try {
        const refreshed = await refreshCalendlyToken(refreshToken);
        accessToken = refreshed.access_token;
        await supabaseAdmin
          .from("platform_connections")
          .update({
            access_token: accessToken,
            token_expires_at: refreshed.expires_at,
          })
          .eq("user_id", userId)
          .eq("platform", "calendly");
      } catch (err) {
        if (err instanceof CalendlyReauthRequiredError) {
          await supabaseAdmin
            .from("platform_connections")
            .update({ access_token: null, refresh_token: null, token_expires_at: null })
            .eq("user_id", userId)
            .eq("platform", "calendly");
          return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
        }
        throw err;
      }
    }


    // Get user URI from stored metadata (needed to query events)
    const metadata = conn.metadata as { user_uri?: string; organization_uri?: string } | null;
    let userUri = metadata?.user_uri ?? null;

    // If we don't have the user URI, fetch it
    if (!userUri) {
      const meRes = await fetch(`${CALENDLY_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const meData = (await meRes.json()) as { resource?: { uri?: string } };
        userUri = meData.resource?.uri ?? null;
        if (userUri) {
          await supabaseAdmin
            .from("platform_connections")
            .update({ metadata: { ...metadata, user_uri: userUri } })
            .eq("user_id", userId)
            .eq("platform", "calendly");
        }
      }
    }

    if (!userUri) throw new Error("Could not determine Calendly user URI.");

    // Fetch scheduled events: now - 1 day → now + 60 days
    const minStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const maxStart = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const params = new URLSearchParams({
      user: userUri,
      status: "active",
      min_start_time: minStart,
      max_start_time: maxStart,
      count: "100",
      sort: "start_time:asc",
    });

    const eventsRes = await fetch(
      `${CALENDLY_API_BASE}/scheduled_events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!eventsRes.ok) {
      const text = await eventsRes.text();
      throw new Error(
        `Calendly events fetch failed: ${eventsRes.status} ${text}`,
      );
    }

    const eventsData = (await eventsRes.json()) as {
      collection?: CalendlyEvent[];
    };
    const events = eventsData.collection ?? [];

    let synced = 0;
    let skipped = 0;

    for (const ev of events) {
      if (ev.status === "canceled") {
        skipped++;
        continue;
      }

      // Extract event UUID from URI for use as external_id
      const externalId = ev.uri.split("/").pop() ?? ev.uri;

      // Fetch first invitee to get client name
      let clientName = "Unknown Client";
      try {
        const invRes = await fetch(
          `${CALENDLY_API_BASE}/scheduled_events/${externalId}/invitees?count=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (invRes.ok) {
          const invData = (await invRes.json()) as {
            collection?: CalendlyInvitee[];
          };
          const invitee = invData.collection?.[0];
          if (invitee) {
            clientName = invitee.name || invitee.email || "Unknown Client";
          }
        }
      } catch (e) {
        console.error("Failed to fetch Calendly invitee:", e);
      }

      const service = ev.name ?? null;

      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("user_id", userId)
        .eq("source_platform", "calendly")
        .eq("external_id", externalId)
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: "calendly",
        external_id: externalId,
        client_name: clientName,
        service,
        starts_at: ev.start_time,
        ends_at: ev.end_time,
        is_block: false,
        note: ev.meeting_notes_plain ?? null,
      };

      if (existing) {
        const { error } = await supabaseAdmin
          .from("appointments")
          .update(row)
          .eq("id", existing.id);
        if (error) {
          console.error("update calendly appointment failed", error);
          continue;
        }
      } else {
        const { error } = await supabaseAdmin
          .from("appointments")
          .insert(row);
        if (error) {
          console.error("insert calendly appointment failed", error);
          continue;
        }
      }
      synced++;
    }

    // Update last synced timestamp
    await supabaseAdmin
      .from("platform_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("platform", "calendly");

    return { synced, skipped, connected: true };
  },
);
