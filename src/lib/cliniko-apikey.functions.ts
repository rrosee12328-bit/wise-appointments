import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

const CLINIKO_API_BASE = "https://api.au1.cliniko.com/v1";

interface ClinikoAppointment {
  id: number;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  did_not_arrive: boolean;
  patient?: {
    links?: { self?: string };
  };
  appointment_type?: {
    name?: string;
  };
  notes?: string | null;
}

interface ClinikoPatient {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
}

// ── Connect ──────────────────────────────────────────────────────────────────

export const connectClinikoApiKey = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ apiKey: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");

    const userId = userData.user.id;

    // Validate the API key by calling /practitioners
    const testRes = await fetch(`${CLINIKO_API_BASE}/practitioners`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${data.apiKey}:`).toString("base64")}`,
        "User-Agent": "Jey Link (support@jeylink.com)",
        Accept: "application/json",
      },
    });

    if (!testRes.ok) {
      throw new Error("Invalid Cliniko API key. Please check and try again.");
    }

    const testData = (await testRes.json()) as {
      practitioners?: Array<{ first_name?: string; last_name?: string; email?: string }>;
    };
    const practitioner = testData.practitioners?.[0];
    const accountLabel = practitioner
      ? [practitioner.first_name, practitioner.last_name]
          .filter(Boolean)
          .join(" ") || practitioner.email || "Cliniko Account"
      : "Cliniko Account";

    const { error: upsertErr } = await supabaseAdmin
      .from("platform_connections")
      .upsert(
        {
          user_id: userId,
          platform: "cliniko",
          status: "connected",
          access_token: data.apiKey,
          refresh_token: null,
          token_expires_at: null,
          account_label: accountLabel,
          metadata: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" },
      );

    if (upsertErr) throw new Error(upsertErr.message);
    return { ok: true, accountLabel };
  });

// ── Sync ─────────────────────────────────────────────────────────────────────

export const syncClinikoAppointments = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");

    const userId = userData.user.id;

    const { data: conn } = await supabaseAdmin
      .from("platform_connections")
      .select("access_token")
      .eq("user_id", userId)
      .eq("platform", "cliniko")
      .maybeSingle();

    if (!conn) return { synced: 0, skipped: 0, connected: false };

    const apiKey = conn.access_token as string;
    const authHeader2 = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
    const headers = {
      Authorization: authHeader2,
      "User-Agent": "Jey Link (support@jeylink.com)",
      Accept: "application/json",
    };

    // Fetch appointments: now - 1 day → now + 60 days
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const apptRes = await fetch(
      `${CLINIKO_API_BASE}/appointments?q[]=starts_at:>=${from}&q[]=starts_at:<=${to}&per_page=100`,
      { headers },
    );

    if (!apptRes.ok) {
      const text = await apptRes.text();
      throw new Error(`Cliniko appointments fetch failed: ${apptRes.status} ${text}`);
    }

    const apptData = (await apptRes.json()) as {
      appointments?: ClinikoAppointment[];
    };
    const appointments = apptData.appointments ?? [];

    let synced = 0;
    let skipped = 0;

    for (const appt of appointments) {
      if (appt.cancelled_at || appt.did_not_arrive) {
        skipped++;
        continue;
      }

      const externalId = String(appt.id);

      // Fetch patient name
      let clientName = "Unknown Client";
      if (appt.patient?.links?.self) {
        try {
          const patRes = await fetch(appt.patient.links.self, { headers });
          if (patRes.ok) {
            const pat = (await patRes.json()) as ClinikoPatient;
            clientName =
              [pat.first_name, pat.last_name].filter(Boolean).join(" ") ||
              pat.email ||
              "Unknown Client";
          }
        } catch {
          // ignore
        }
      }

      const service = appt.appointment_type?.name ?? null;

      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("user_id", userId)
        .eq("source_platform", "cliniko")
        .eq("external_id", externalId)
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: "cliniko",
        external_id: externalId,
        client_name: clientName,
        service,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        is_block: false,
        note: appt.notes ?? null,
      };

      if (existing) {
        await supabaseAdmin.from("appointments").update(row).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("appointments").insert(row);
      }
      synced++;
    }

    await supabaseAdmin
      .from("platform_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("platform", "cliniko");

    return { synced, skipped, connected: true };
  },
);
