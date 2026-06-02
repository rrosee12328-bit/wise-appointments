import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { syncGoogleBlocksForUser } from "@/lib/google-writeback.server";
import { syncOutlookBlocksForUser } from "@/lib/outlook-writeback.server";


const ACUITY_API_BASE = "https://acuityscheduling.com/api/v1";

interface AcuityAppointment {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  type: string;
  datetime: string;
  endTime: string;
  duration: number;
  notes: string | null;
  canceled: boolean;
}

function addMinutesToTimestamp(timestamp: string, minutes: number) {
  const start = new Date(timestamp);
  if (Number.isNaN(start.getTime())) return null;

  return new Date(start.getTime() + minutes * 60 * 1000).toISOString();
}

export const syncAcuityAppointments = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");

    const userId = userData.user.id;

    // Load the Acuity connection for this user
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("platform_connections")
      .select("access_token")
      .eq("user_id", userId)
      .eq("platform", "acuity")
      .maybeSingle();

    if (connErr) throw new Error(connErr.message);
    if (!conn) return { synced: 0, skipped: 0, connected: false };

    const accessToken = conn.access_token as string;

    // Fetch appointments: now - 1 day → now + 60 days
    const minDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const maxDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const params = new URLSearchParams({
      minDate,
      maxDate,
      max: "100",
    });

    const apptRes = await fetch(
      `${ACUITY_API_BASE}/appointments?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!apptRes.ok) {
      const text = await apptRes.text();
      throw new Error(`Acuity appointments fetch failed: ${apptRes.status} ${text}`);
    }

    const appointments = (await apptRes.json()) as AcuityAppointment[];

    let synced = 0;
    let skipped = 0;

    for (const appt of appointments) {
      // Skip cancelled appointments
      if (appt.canceled) {
        skipped++;
        continue;
      }

      const externalId = String(appt.id);
      const clientName =
        [appt.firstName, appt.lastName].filter(Boolean).join(" ") ||
        appt.email ||
        "Unknown Client";

      // Acuity's endTime is only a clock value (for example "10:20am"),
      // so calculate a full timestamp from the appointment start + duration.
      const startsAt = appt.datetime;
      const endsAt = addMinutesToTimestamp(appt.datetime, appt.duration);

      if (!endsAt) {
        console.error("skip acuity appointment with invalid datetime", {
          id: appt.id,
          datetime: appt.datetime,
          duration: appt.duration,
        });
        skipped++;
        continue;
      }

      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id, local_override")
        .eq("user_id", userId)
        .eq("source_platform", "acuity")
        .eq("external_id", externalId)
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: "acuity",
        external_id: externalId,
        external_url: `https://secure.acuityscheduling.com/appointments.php?action=appt&id=${externalId}`,
        client_name: clientName,
        service: appt.type ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        is_block: false,
        note: appt.notes ?? null,
      };


      if (existing) {
        const payload = stripTimesIfOverridden(row, existing);
        const { error } = await supabaseAdmin
          .from("appointments")
          .update(payload)
          .eq("id", existing.id);
        if (error) {
          console.error("update acuity appointment failed", error);
          continue;
        }
      } else {
        const { error } = await supabaseAdmin
          .from("appointments")
          .insert(row);
        if (error) {
          console.error("insert acuity appointment failed", error);
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
      .eq("platform", "acuity");

    try { await syncGoogleBlocksForUser(userId, "acuity"); } catch (e) { console.error("acuity: syncGoogleBlocksForUser failed", e); }
    try { await syncOutlookBlocksForUser(userId, "acuity"); } catch (e) { console.error("acuity: syncOutlookBlocksForUser failed", e); }


    return { synced, skipped, connected: true };
  },
);
