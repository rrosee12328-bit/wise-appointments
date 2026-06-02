import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { signState } from "@/lib/oauth-state.server";
import { randomBytes } from "crypto";

// Calendly uses "default" — the token inherits whatever scopes the OAuth app is configured with.
// Listing extra scope names here causes Calendly to reject the authorize request with an error screen.
const CALENDLY_SCOPES = "default users:read scheduled_events:read event_types:read organizations:read";

function getCalendlyRedirectUri(host: string) {
  const configuredOrigin = process.env.CALENDLY_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin)
    return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/calendly/callback`;
  const isLocal = host.includes("localhost");
  const origin = isLocal ? `http://${host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/calendly/callback`;
}

export const createCalendlyAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid session");

    const host = getRequestHost();
    const redirectUri = getCalendlyRedirectUri(host);

    const state = signState({
      userId: data.user.id,
      nonce: randomBytes(12).toString("hex"),
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: process.env.CALENDLY_OAUTH_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: CALENDLY_SCOPES,
      state,
    });

    return {
      url: `https://auth.calendly.com/oauth/authorize?${params.toString()}`,
    };
  });
