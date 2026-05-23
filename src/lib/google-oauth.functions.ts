import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { signState } from "@/lib/oauth-state.server";
import { randomBytes } from "crypto";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "openid",
  "email",
].join(" ");

function getGoogleRedirectUri(host: string) {
  const configuredOrigin = process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin) return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/google/callback`;

  const isLocal = host.includes("localhost");
  const origin = isLocal ? `http://${host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/google/callback`;
}

export const createGoogleAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid session");

    const host = getRequestHost();
    const redirectUri = getGoogleRedirectUri(host);

    const state = signState({
      userId: data.user.id,
      nonce: randomBytes(12).toString("hex"),
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const listConnections = createServerFn({ method: "GET" })
  .handler(async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) return { connections: [] };
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData.user) return { connections: [] };

    const { data } = await supabaseAdmin
      .from("platform_connections")
      .select("platform, account_label, token_expires_at, updated_at")
      .eq("user_id", userData.user.id);
    return {
      connections: (data ?? []).map((row) => ({
        platform: row.platform,
        account_email: row.account_label,
        expires_at: row.token_expires_at,
        updated_at: row.updated_at,
      })),
    };
  });

export const disconnectPlatform = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ platform: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");
    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !userData.user) throw new Error("Invalid session");

    await supabaseAdmin
      .from("platform_connections")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("platform", data.platform);
    return { ok: true };
  });
