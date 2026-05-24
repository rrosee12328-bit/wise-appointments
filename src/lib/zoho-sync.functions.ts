import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";

interface ZohoAppointment {
  booking_id?: string;
  customer_name?: string;
  customer_email?: string;
  service_name?: string;
  staff_name?: string;
  iso_start_time?: string;
  iso_end_time?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  notes?: string;
}

interface ZohoFetchAppointmentResponse {
  response?: {
    returnvalue?:
      | {
          response?: ZohoAppointment[];
          data?: ZohoAppointment[];
          next_page_available?: boolean;
          page?: number;
        }
      | ZohoAppointment[];
    status?: string;
  };
}

async function refreshZohoToken(refreshToken: string): Promise<{
  access_token: string;
  expires_at: string;
}> {
  const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.ZOHO_OAUTH_CLIENT_ID!,
      client_secret: process.env.ZOHO_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

function formatZohoDate(date: Date): string {
  // Zoho expects: dd-MMM-yyyy HH:mm:ss
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dd = String(date.getDate()).padStart(2, "0");
  const mmm = months[date.getMonth()];
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mmm}-${yyyy} ${hh}:${min}:${ss}`;
}

function extractZohoAppointments(data: ZohoFetchAppointmentResponse) {
  const returnValue = data.response?.returnvalue;
  if (Array.isArray(returnValue)) {
    return { appointments: returnValue, nextPageAvailable: false };
  }

  return {
    appointments: returnValue?.response ?? returnValue?.data ?? [],
    nextPageAvailable: returnValue?.next_page_available === true,
  };
}

export const syncZohoBookings = createServerFn({ method: "POST" }).handler(async () => {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Not authenticated");

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) throw new Error("Invalid session");

  const userId = userData.user.id;

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, refresh_token, token_expires_at, metadata")
    .eq("user_id", userId)
    .eq("platform", "zoho")
    .maybeSingle();

  if (connErr) throw new Error(connErr.message);
  if (!conn) return { synced: 0, skipped: 0, connected: false };

  let accessToken = conn.access_token as string | null;
  const refreshToken = conn.refresh_token as string | null;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;

  if (!accessToken || expiresAt - Date.now() < 60_000) {
    if (!refreshToken) throw new Error("No refresh token. Please reconnect Zoho Bookings.");
    const refreshed = await refreshZohoToken(refreshToken);
    accessToken = refreshed.access_token;
    await supabaseAdmin
      .from("platform_connections")
      .update({
        access_token: accessToken,
        token_expires_at: refreshed.expires_at,
      })
      .eq("user_id", userId)
      .eq("platform", "zoho");
  }

  const metadata = conn.metadata as { api_domain?: string } | null;
  const apiBase = metadata?.api_domain ?? "https://www.zohoapis.com";

  // Fetch appointments: now - 1 day → now + 60 days
  const fromTime = formatZohoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const toTime = formatZohoDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

  const appointments: ZohoAppointment[] = [];
  let page = 1;
  let nextPageAvailable = true;

  while (nextPageAvailable) {
    const apptRes = await fetch(`${apiBase}/bookings/v1/json/fetchappointment`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        data: JSON.stringify({
          from_time: fromTime,
          to_time: toTime,
          per_page: "100",
          page,
        }),
      }),
    });

    if (!apptRes.ok) {
      const text = await apptRes.text();
      throw new Error(`Zoho appointments fetch failed: ${apptRes.status} ${text}`);
    }

    const apptData = (await apptRes.json()) as ZohoFetchAppointmentResponse;
    const extracted = extractZohoAppointments(apptData);
    appointments.push(...extracted.appointments);
    nextPageAvailable = extracted.nextPageAvailable;
    page += 1;
  }

  let synced = 0;
  let skipped = 0;

  for (const appt of appointments) {
    const status = appt.status?.toUpperCase();
    if (status === "CANCEL" || status === "NO_SHOW") {
      skipped++;
      continue;
    }

    // Use ISO times if available, otherwise parse Zoho's custom format
    const startsAt = appt.iso_start_time ?? appt.start_time;
    const endsAt = appt.iso_end_time ?? appt.end_time;

    if (!startsAt || !endsAt) {
      skipped++;
      continue;
    }

    const externalId = appt.booking_id ?? `${appt.customer_email}-${startsAt}`;
    const clientName = appt.customer_name || appt.customer_email || "Unknown Client";
    const service = appt.service_name ?? null;

    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("user_id", userId)
      .eq("source_platform", "zoho")
      .eq("external_id", externalId)
      .maybeSingle();

    const row = {
      user_id: userId,
      source_platform: "zoho",
      external_id: externalId,
      client_name: clientName,
      service,
      starts_at: startsAt,
      ends_at: endsAt,
      is_block: false,
      note: appt.notes ?? null,
    };

    if (existing) {
      const { error } = await supabaseAdmin.from("appointments").update(row).eq("id", existing.id);
      if (error) {
        console.error("update zoho appointment failed", error);
        continue;
      }
    } else {
      const { error } = await supabaseAdmin.from("appointments").insert(row);
      if (error) {
        console.error("insert zoho appointment failed", error);
        continue;
      }
    }
    synced++;
  }

  await supabaseAdmin
    .from("platform_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("platform", "zoho");

  return { synced, skipped, connected: true };
});
