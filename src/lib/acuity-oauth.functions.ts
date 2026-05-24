import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

function getAcuityRedirectUri(host: string) {
  const configuredOrigin = process.env.ACUITY_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin)
    return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/acuity/callback`;
  const isLocal = host.includes("localhost");
  const origin = isLocal ? `http://${host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/acuity/callback`;
}

export const createAcuityAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid session");

    const host = getRequestHost();
    const redirectUri = getAcuityRedirectUri(host);

    // Store userId in a pending_acuity_oauth row so we can retrieve it in the callback
    // Acuity's OAuth does not support the `state` parameter
    await supabaseAdmin
      .from("platform_connections")
      .upsert(
        {
          user_id: data.user.id,
          platform: "acuity_pending",
          status: "pending",
          access_token: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" },
      );

    // Acuity OAuth URL — no state parameter (not supported)
    const url =
      `https://acuityscheduling.com/oauth2/authorize` +
      `?response_type=code` +
      `&scope=api-v1` +
      `&client_id=${encodeURIComponent(process.env.ACUITY_OAUTH_CLIENT_ID!)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return { url };
  });
