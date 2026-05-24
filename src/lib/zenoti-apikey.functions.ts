import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

const ZENOTI_API_BASE = "https://api.zenoti.com/v1";

interface ZenotiAppointment {
  id: string;
  start_time: string;
  end_time: string;
  status?: number; // 1=Booked, 2=Closed, 4=Cancelled, 8=NoShow
  guest?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  service?: {
    name?: string;
  };
  notes?: string | null;
}

// ── Connect ──────────────────────────────────────────────────────────────────

export const connectZenotiApiKey = createServerFn({ method: "POST" })
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

    // Validate the API key by calling /centers
    const testRes = await fetch(`${ZENOTI_API_BASE}/centers`, {
      headers: {
        Authorization: `apikey ${data.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!testRes.ok) {
      throw new Error("Invalid Zenoti API key. Please check and try again.");
    }

    const testData = (await testRes.json()) as {
      centers?: Array<{ name?: string; code?: string }>;
    };
    const center = testData.centers?.[0];
    const accountLabel = center?.name ?? "Zenoti Account";

    const { error: upsertErr } = await supabaseAdmin
      .from("platform_connections")
      .upsert(
        {
          user_id: userId,
          platform: "zenoti",
          status: "connected",
          access_token: data.apiKey,
          refresh_token: null,
          token_expires_at: null,
          account_label: accountLabel,
          metadata: {
            center_code: center?.code ?? null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" },
      );

    if (upsertErr) throw new Error(upsertErr.message);
    return { ok: true, accountLabel };
  });

// ── Sync ─────────────────────────────────────────────────────────────────────

export const syncZenotiAppointments = createServerFn({ method: "POST" }).handler(
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
      .select("access_token, metadata")
      .eq("user_id", userId)
      .eq("platform", "zenoti")
      .maybeSingle();

    if (!conn) return { synced: 0, skipped: 0, connected: false };

    const apiKey = conn.access_token as string;
    const metadata = conn.metadata as { center_code?: string } | null;
    const centerCode = metadata?.center_code;

    const reqHeaders = {
      Authorization: `apikey ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Get centers if we don't have one stored
    let centerId: string | null = null;
    try {
      const centersRes = await fetch(`${ZENOTI_API_BASE}/centers`, {
        headers: reqHeaders,
      });
      if (centersRes.ok) {
        const centersData = (await centersRes.json()) as {
          centers?: Array<{ id?: string; code?: string }>;
        };
        const center = centerCode
          ? centersData.centers?.find((c) => c.code === centerCode)
          : centersData.centers?.[0];
        centerId = center?.id ?? null;
      }
    } catch {
      // ignore
    }

    if (!centerId) throw new Error("Could not determine Zenoti center ID.");

    // Fetch appointments: now - 1 day → now + 60 days
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const endDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const apptRes = await fetch(
      `${ZENOTI_API_BASE}/centers/${centerId}/appointments?start_date=${startDate}&end_date=${endDate}&size=100`,
      { headers: reqHeaders },
    );

    if (!apptRes.ok) {
      const text = await apptRes.text();
      throw new Error(`Zenoti appointments fetch failed: ${apptRes.status} ${text}`);
    }

    const apptData = (await apptRes.json()) as {
      appointments?: ZenotiAppointment[];
    };
    const appointments = apptData.appointments ?? [];

    let synced = 0;
    let skipped = 0;

    for (const appt of appointments) {
      // Skip cancelled (4) and no-show (8)
      if (appt.status === 4 || appt.status === 8) {
        skipped++;
        continue;
      }

      const externalId = appt.id;
      const clientName =
        [appt.guest?.first_name, appt.guest?.last_name]
          .filter(Boolean)
          .join(" ") ||
        appt.guest?.email ||
        "Unknown Client";

      const service = appt.service?.name ?? null;

      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("user_id", userId)
        .eq("source_platform", "zenoti")
        .eq("external_id", externalId)
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: "zenoti",
        external_id: externalId,
        client_name: clientName,
        service,
        starts_at: appt.start_time,
        ends_at: appt.end_time,
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
      .eq("platform", "zenoti");

    return { synced, skipped, connected: true };
  },
);
