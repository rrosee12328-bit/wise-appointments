import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { signState } from "@/lib/oauth-state.server";
import { randomBytes } from "crypto";

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

    const state = signState({
      userId: data.user.id,
      nonce: randomBytes(12).toString("hex"),
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: process.env.ACUITY_OAUTH_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "api-v1",
      state,
    });

    return {
      url: `https://acuityscheduling.com/oauth2/authorize?${params.toString()}`,
    };
  });
