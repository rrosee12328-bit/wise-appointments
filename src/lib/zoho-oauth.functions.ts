import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { signState } from "@/lib/oauth-state.server";
import { randomBytes } from "crypto";

// Zoho uses data-center-specific domains — default to .com (US)
// Users in other regions (EU, IN, AU) will need their own DC
const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";

function getZohoRedirectUri(host: string) {
  const configuredOrigin = process.env.ZOHO_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin)
    return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/zoho/callback`;
  const isLocal = host.includes("localhost");
  const origin = isLocal ? `http://${host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/zoho/callback`;
}

export const createZohoAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid session");

    const host = getRequestHost();
    const redirectUri = getZohoRedirectUri(host);

    const state = signState({
      userId: data.user.id,
      nonce: randomBytes(12).toString("hex"),
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.ZOHO_OAUTH_CLIENT_ID!,
      scope: "zohobookings.data.READ,zohobookings.data.CREATE",
      redirect_uri: redirectUri,
      access_type: "offline",
      state,
    });

    return {
      url: `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${params.toString()}`,
    };
  });
