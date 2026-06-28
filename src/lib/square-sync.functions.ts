import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { syncGoogleBlocksForUser } from "@/lib/google-writeback.server";
import { syncOutlookBlocksForUser } from "@/lib/outlook-writeback.server";
import { stripTimesIfOverridden } from "@/lib/sync-helpers.server";

const SQUARE_API_BASE =
  process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

const SQUARE_VERSION = "2024-01-18";
const SQUARE_MAX_BOOKING_RANGE_DAYS = 31;

interface SquareBooking {
  id: string;
  status: string;
  start_at?: string;
  duration_minutes?: number;
  appointment_segments?: Array<{
    duration_minutes?: number;
    service_variation_id?: string;
    team_member_id?: string;
  }>;
  customer_id?: string;
  customer_note?: string;
  seller_note?: string;
  location_id?: string;
}

interface SquareCustomer {
  id: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
}

async function fetchSquareBookings(
  accessToken: string,
  startAt: string,
  endAt: string,
): Promise<SquareBooking[]> {
  const bookings: SquareBooking[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      start_at_min: startAt,
      start_at_max: endAt,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const bookingsRes = await fetch(`${SQUARE_API_BASE}/v2/bookings?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Square-Version": SQUARE_VERSION,
      },
    });

    if (!bookingsRes.ok) {
      const text = await bookingsRes.text();
      throw new Error(`Square bookings fetch failed: ${bookingsRes.status} ${text}`);
    }

    const bookingsData = (await bookingsRes.json()) as {
      bookings?: SquareBooking[];
      cursor?: string;
    };
    bookings.push(...(bookingsData.bookings ?? []));
    cursor = bookingsData.cursor;
  } while (cursor);

  return bookings;
}

async function refreshSquareToken(refreshToken: string): Promise<{
  access_token: string;
  expires_at: string;
}> {
  const res = await fetch(`${SQUARE_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify({
      client_id: process.env.SQUARE_OAUTH_CLIENT_ID!,
      client_secret: process.env.SQUARE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Square token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_at?: string;
  };

  return {
    access_token: data.access_token,
    expires_at: data.expires_at ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export const syncSquareBookings = createServerFn({ method: "POST" }).handler(async () => {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { synced: 0, skipped: 0, connected: false };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) throw new Error("Invalid session");

  const userId = userData.user.id;

  // Load the Square connection for this user
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("platform", "square")
    .maybeSingle();

  if (connErr) throw new Error(connErr.message);
  if (!conn) return { synced: 0, skipped: 0, connected: false };

  let accessToken = conn.access_token as string | null;
  const refreshToken = conn.refresh_token as string | null;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;

  // Refresh token if expired or about to expire within 60 seconds
  if (!accessToken || expiresAt - Date.now() < 60_000) {
    if (!refreshToken) throw new Error("No refresh token. Please reconnect Square.");
    const refreshed = await refreshSquareToken(refreshToken);
    accessToken = refreshed.access_token;
    await supabaseAdmin
      .from("platform_connections")
      .update({
        access_token: accessToken,
        token_expires_at: refreshed.expires_at,
      })
      .eq("user_id", userId)
      .eq("platform", "square");
  }

  // Square limits ListBookings to a maximum 31-day time range, so split
  // the app's now - 1 day → now + 60 days sync window into valid chunks.
  const syncStart = Date.now() - 24 * 60 * 60 * 1000;
  const syncEnd = Date.now() + 60 * 24 * 60 * 60 * 1000;
  const bookings: SquareBooking[] = [];
  for (let cursorMs = syncStart; cursorMs < syncEnd; ) {
    const chunkEndMs = Math.min(
      cursorMs + SQUARE_MAX_BOOKING_RANGE_DAYS * 24 * 60 * 60 * 1000 - 1000,
      syncEnd,
    );
    bookings.push(
      ...(await fetchSquareBookings(
        accessToken,
        new Date(cursorMs).toISOString(),
        new Date(chunkEndMs).toISOString(),
      )),
    );
    cursorMs = chunkEndMs + 1000;
  }

  // Collect unique customer IDs to batch-fetch names
  const customerIds = [
    ...new Set(bookings.map((b) => b.customer_id).filter((id): id is string => !!id)),
  ];

  // Fetch customer details in one batch call (up to 100)
  const customerMap = new Map<string, SquareCustomer>();
  if (customerIds.length > 0) {
    try {
      const custRes = await fetch(`${SQUARE_API_BASE}/v2/customers/bulk-retrieve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Square-Version": SQUARE_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customer_ids: customerIds }),
      });
      if (custRes.ok) {
        const custData = (await custRes.json()) as {
          customers?: SquareCustomer[];
          responses?: Record<string, { customer?: SquareCustomer }>;
        };
        for (const c of custData.customers ?? []) {
          customerMap.set(c.id, c);
        }
        for (const response of Object.values(custData.responses ?? {})) {
          if (response.customer) customerMap.set(response.customer.id, response.customer);
        }
      }
    } catch (e) {
      console.error("Failed to batch-fetch Square customers:", e);
    }
  }

  let synced = 0;
  let skipped = 0;

  for (const booking of bookings) {
    // Skip cancelled bookings
    if (
      booking.status === "CANCELLED_BY_SELLER" ||
      booking.status === "CANCELLED_BY_CUSTOMER" ||
      booking.status === "NO_SHOW"
    ) {
      skipped++;
      continue;
    }

    const startISO = booking.start_at;
    if (!startISO) {
      skipped++;
      continue;
    }

    // Calculate end time from duration
    const durationMinutes =
      booking.appointment_segments?.[0]?.duration_minutes ?? booking.duration_minutes ?? 60;
    const endISO = new Date(
      new Date(startISO).getTime() + durationMinutes * 60 * 1000,
    ).toISOString();

    // Resolve client name
    const customer = booking.customer_id ? customerMap.get(booking.customer_id) : undefined;
    const clientName = customer
      ? [customer.given_name, customer.family_name].filter(Boolean).join(" ") ||
        customer.email_address ||
        "Unknown Client"
      : booking.customer_note?.split("\n")[0] || "Unknown Client";

    // Service name (we don't fetch catalog here to keep it lightweight)
    const service = booking.seller_note ?? null;

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id, local_override")
      .eq("user_id", userId)
      .eq("source_platform", "square")
      .eq("external_id", booking.id)
      .maybeSingle();

    const row = {
      user_id: userId,
      source_platform: "square",
      external_id: booking.id,
      external_url: `https://squareup.com/dashboard/appointments/${booking.id}`,
      client_name: clientName,
      service,
      starts_at: startISO,
      ends_at: endISO,
      is_block: false,
      note: booking.customer_note ?? null,
    };

    if (existing) {
      const payload = stripTimesIfOverridden(row, existing);
      const { error } = await supabaseAdmin
        .from("appointments")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        console.error("update square appointment failed", error);
        continue;
      }
    } else {
      const { error } = await supabaseAdmin.from("appointments").insert(row);
      if (error) {
        console.error("insert square appointment failed", error);
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
    .eq("platform", "square");

  try {
    await syncGoogleBlocksForUser(userId, "square");
  } catch (e) {
    console.error("square: syncGoogleBlocksForUser failed", e);
  }
  try {
    await syncOutlookBlocksForUser(userId, "square");
  } catch (e) {
    console.error("square: syncOutlookBlocksForUser failed", e);
  }

  return { synced, skipped, connected: true };
});
