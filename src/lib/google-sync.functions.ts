import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  organizer?: { displayName?: string; email?: string };
  creator?: { displayName?: string; email?: string };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  transparency?: string; // "transparent" = Free, omitted = Busy
  source?: { title?: string; url?: string };
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

// ── Smart platform detection ──────────────────────────────────────────────────
// Detects which booking platform created a Google Calendar event based on
// signals in the event title, description, organizer email, and source URL.

type DetectedPlatform =
  | "thecut"
  | "booksy"
  | "glossgenius"
  | "styleseat"
  | "goldie"
  | "vagaro"
  | "fresha"
  | "mangomint"
  | "boulevard"
  | "squire"
  | "ringmybarber"
  | "barberly"
  | "square"
  | "acuity"
  | "calendly"
  | "simplybook"
  | "zoho"
  | "setmore"
  | "google_calendar";

interface PlatformSignal {
  platform: DetectedPlatform;
  // Strings to check in organizer email, creator email, source URL, description
  emailPatterns?: string[];
  urlPatterns?: string[];
  descriptionPatterns?: string[];
  titlePatterns?: string[];
}

const PLATFORM_SIGNALS: PlatformSignal[] = [
  {
    platform: "thecut",
    emailPatterns: ["thecut.co", "noreply@thecut.co"],
    urlPatterns: ["thecut.co"],
    descriptionPatterns: ["thecut.co", "theCut", "the cut app"],
    titlePatterns: ["via theCut", "- theCut"],
  },
  {
    platform: "booksy",
    emailPatterns: ["booksy.com", "noreply@booksy.com"],
    urlPatterns: ["booksy.com"],
    descriptionPatterns: ["booksy.com", "Booksy appointment", "booked via Booksy"],
    titlePatterns: ["via Booksy", "- Booksy"],
  },
  {
    platform: "glossgenius",
    emailPatterns: ["glossgenius.com", "noreply@glossgenius.com"],
    urlPatterns: ["glossgenius.com"],
    descriptionPatterns: ["glossgenius.com", "GlossGenius", "Gloss Genius"],
    titlePatterns: ["via GlossGenius", "- GlossGenius"],
  },
  {
    platform: "styleseat",
    emailPatterns: ["styleseat.com", "noreply@styleseat.com"],
    urlPatterns: ["styleseat.com"],
    descriptionPatterns: ["styleseat.com", "StyleSeat"],
    titlePatterns: ["via StyleSeat", "- StyleSeat"],
  },
  {
    platform: "goldie",
    emailPatterns: ["heygoldie.com", "noreply@heygoldie.com"],
    urlPatterns: ["heygoldie.com", "goldie.app"],
    descriptionPatterns: ["heygoldie.com", "Goldie app", "via Goldie"],
    titlePatterns: ["via Goldie", "- Goldie"],
  },
  {
    platform: "vagaro",
    emailPatterns: ["vagaro.com", "noreply@vagaro.com"],
    urlPatterns: ["vagaro.com"],
    descriptionPatterns: ["vagaro.com", "Vagaro appointment"],
    titlePatterns: ["via Vagaro", "- Vagaro"],
  },
  {
    platform: "fresha",
    emailPatterns: ["fresha.com", "noreply@fresha.com"],
    urlPatterns: ["fresha.com"],
    descriptionPatterns: ["fresha.com", "Fresha appointment"],
    titlePatterns: ["via Fresha", "- Fresha"],
  },
  {
    platform: "mangomint",
    emailPatterns: ["mangomint.com", "noreply@mangomint.com"],
    urlPatterns: ["mangomint.com"],
    descriptionPatterns: ["mangomint.com", "Mangomint"],
    titlePatterns: ["via Mangomint", "- Mangomint"],
  },
  {
    platform: "boulevard",
    emailPatterns: ["joinblvd.com", "noreply@joinblvd.com"],
    urlPatterns: ["joinblvd.com", "boulevard.app"],
    descriptionPatterns: ["joinblvd.com", "Boulevard appointment"],
    titlePatterns: ["via Boulevard", "- Boulevard"],
  },
  {
    platform: "squire",
    emailPatterns: ["getsquire.com", "noreply@getsquire.com"],
    urlPatterns: ["getsquire.com"],
    descriptionPatterns: ["getsquire.com", "SQUIRE appointment"],
    titlePatterns: ["via SQUIRE", "- SQUIRE"],
  },
  {
    platform: "ringmybarber",
    emailPatterns: ["ringmybarber.com"],
    urlPatterns: ["ringmybarber.com"],
    descriptionPatterns: ["ringmybarber.com", "Ring My Barber"],
    titlePatterns: ["via Ring My Barber"],
  },
  {
    platform: "barberly",
    emailPatterns: ["barberly.com"],
    urlPatterns: ["barberly.com"],
    descriptionPatterns: ["barberly.com", "Barberly"],
    titlePatterns: ["via Barberly"],
  },
  {
    platform: "square",
    emailPatterns: ["squareup.com", "noreply@squareup.com"],
    urlPatterns: ["squareup.com", "square.site"],
    descriptionPatterns: ["squareup.com", "Square appointment", "Square Appointments"],
    titlePatterns: ["via Square", "- Square Appointments"],
  },
  {
    platform: "acuity",
    emailPatterns: ["acuityscheduling.com", "noreply@acuityscheduling.com"],
    urlPatterns: ["acuityscheduling.com"],
    descriptionPatterns: ["acuityscheduling.com", "Acuity Scheduling"],
    titlePatterns: ["via Acuity", "- Acuity"],
  },
  {
    platform: "calendly",
    emailPatterns: ["calendly.com", "noreply@calendly.com"],
    urlPatterns: ["calendly.com"],
    descriptionPatterns: ["calendly.com", "Calendly meeting", "Calendly event"],
    titlePatterns: ["via Calendly"],
  },
  {
    platform: "setmore",
    emailPatterns: ["setmore.com", "noreply@setmore.com"],
    urlPatterns: ["setmore.com"],
    descriptionPatterns: ["setmore.com", "Setmore appointment"],
    titlePatterns: ["via Setmore", "- Setmore"],
  },
  {
    platform: "simplybook",
    emailPatterns: ["simplybook.me"],
    urlPatterns: ["simplybook.me"],
    descriptionPatterns: ["simplybook.me", "SimplyBook"],
    titlePatterns: ["via SimplyBook"],
  },
  {
    platform: "zoho",
    emailPatterns: ["zoho.com", "zohobookings.com"],
    urlPatterns: ["zohobookings.com", "zoho.com/bookings"],
    descriptionPatterns: ["zohobookings.com", "Zoho Bookings"],
    titlePatterns: ["via Zoho Bookings"],
  },
];

function detectPlatform(ev: GoogleEvent): DetectedPlatform {
  const searchText = [
    ev.description ?? "",
    ev.organizer?.email ?? "",
    ev.organizer?.displayName ?? "",
    ev.creator?.email ?? "",
    ev.source?.url ?? "",
    ev.source?.title ?? "",
    ev.location ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const titleText = (ev.summary ?? "").toLowerCase();

  for (const signal of PLATFORM_SIGNALS) {
    // Check email patterns
    if (signal.emailPatterns?.some((p) => searchText.includes(p.toLowerCase()))) {
      return signal.platform;
    }
    // Check URL patterns
    if (signal.urlPatterns?.some((p) => searchText.includes(p.toLowerCase()))) {
      return signal.platform;
    }
    // Check description patterns
    if (signal.descriptionPatterns?.some((p) => searchText.includes(p.toLowerCase()))) {
      return signal.platform;
    }
    // Check title patterns
    if (signal.titlePatterns?.some((p) => titleText.includes(p.toLowerCase()))) {
      return signal.platform;
    }
  }

  return "google_calendar";
}

// ── Refresh token ─────────────────────────────────────────────────────────────

class GoogleReauthRequiredError extends Error {
  constructor(message = "Google reconnection required") {
    super(message);
    this.name = "GoogleReauthRequiredError";
  }
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && text.includes("invalid_grant")) {
      throw new GoogleReauthRequiredError();
    }
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export const syncGoogleCalendar = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");
    const userId = userData.user.id;

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("platform_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("user_id", userId)
      .eq("platform", "google_calendar")
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) {
      return { synced: 0, skipped: 0, connected: false };
    }

    let accessToken = conn.access_token as string | null;
    const refreshToken = conn.refresh_token as string | null;
    const expiresAt = conn.token_expires_at
      ? new Date(conn.token_expires_at as string).getTime()
      : 0;

    if (!accessToken || expiresAt - Date.now() < 60_000) {
      if (!refreshToken) {
        return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
      }
      try {
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabaseAdmin
          .from("platform_connections")
          .update({
            access_token: accessToken,
            token_expires_at: newExpiresAt,
          })
          .eq("user_id", userId)
          .eq("platform", "google_calendar");
      } catch (err) {
        if (err instanceof GoogleReauthRequiredError) {
          await supabaseAdmin
            .from("platform_connections")
            .update({
              access_token: null,
              refresh_token: null,
              token_expires_at: null,
              status: "disconnected",
            })
            .eq("user_id", userId)
            .eq("platform", "google_calendar");
          return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
        }
        throw err;
      }
    }

    // Pull events from now - 1 day → now + 60 days from primary calendar.
    // Request extra fields for platform detection.
    const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields:
        "items(id,status,summary,description,location,organizer,creator,start,end,transparency,source,extendedProperties)",
    });
    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!evRes.ok) {
      const text = await evRes.text();
      throw new Error(`Google Calendar fetch failed: ${evRes.status} ${text}`);
    }
    const payload = (await evRes.json()) as { items?: GoogleEvent[] };
    const items = payload.items ?? [];

    let synced = 0;
    let skipped = 0;

    for (const ev of items) {
      // Skip cancelled, all-day, or "Free" events.
      if (ev.status === "cancelled") {
        skipped++;
        continue;
      }
      const startISO = ev.start?.dateTime;
      const endISO = ev.end?.dateTime;
      if (!startISO || !endISO) {
        skipped++;
        continue;
      }
      if (ev.transparency === "transparent") {
        skipped++;
        continue;
      }

      // Detect which platform this event came from
      const sourcePlatform = detectPlatform(ev);

      const title = (ev.summary ?? "Untitled").trim();
      // Allow "Client — Service" or "Client - Service" or "Client: Service" splits.
      const split = title.split(/\s+[—\-:]\s+/);
      const clientName = split[0] || "Untitled";
      const service = split.length > 1 ? split.slice(1).join(" - ") : null;

      // Upsert keyed on (user_id, source_platform, external_id).
      // If the platform changed (re-detection), update the existing row.
      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("user_id", userId)
        .eq("external_id", ev.id)
        .or("source_platform.eq.google_calendar,source_platform.eq.thecut,source_platform.eq.booksy,source_platform.eq.glossgenius,source_platform.eq.styleseat,source_platform.eq.goldie,source_platform.eq.vagaro,source_platform.eq.fresha,source_platform.eq.mangomint,source_platform.eq.boulevard,source_platform.eq.squire,source_platform.eq.ringmybarber,source_platform.eq.barberly,source_platform.eq.square,source_platform.eq.acuity,source_platform.eq.calendly,source_platform.eq.setmore,source_platform.eq.simplybook,source_platform.eq.zoho")
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: sourcePlatform,
        external_id: ev.id,
        client_name: clientName,
        service,
        starts_at: startISO,
        ends_at: endISO,
        is_block: false,
        note: ev.description ?? null,
      };

      if (existing) {
        const { error } = await supabaseAdmin
          .from("appointments")
          .update(row)
          .eq("id", existing.id);
        if (error) {
          console.error("update appointment failed", error);
          continue;
        }
      } else {
        const { error } = await supabaseAdmin.from("appointments").insert(row);
        if (error) {
          console.error("insert appointment failed", error);
          continue;
        }
      }
      synced++;
    }

    await supabaseAdmin
      .from("platform_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("platform", "google_calendar");

    return { synced, skipped, connected: true };
  },
);
