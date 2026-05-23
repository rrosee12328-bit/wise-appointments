import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { signState } from "@/lib/oauth-state.server";
import { randomBytes } from "crypto";

// Square OAuth scopes needed for reading bookings/appointments
const SQUARE_SCOPES = [
  "APPOINTMENTS_READ",
  "APPOINTMENTS_ALL_READ",
  "APPOINTMENTS_BUSINESS_SETTINGS_READ",
  "CUSTOMERS_READ",
].join(" ");

function getSquareRedirectUri(host: string) {
  const configuredOrigin = process.env.SQUARE_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin) return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/square/callback`;
  const isLocal = host.includes("localhost");
  const origin = isLocal ? `http://${host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/square/callback`;
}

export const createSquareAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid session");

    const host = getRequestHost();
    const redirectUri = getSquareRedirectUri(host);

    const state = signState({
      userId: data.user.id,
      nonce: randomBytes(12).toString("hex"),
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: process.env.SQUARE_OAUTH_CLIENT_ID!,
      scope: SQUARE_SCOPES,
      session: "false",
      state,
    });

    // Square uses sandbox or production base URL
    const baseUrl =
      process.env.SQUARE_ENVIRONMENT === "sandbox"
        ? "https://connect.squareupsandbox.com/oauth2/authorize"
        : "https://connect.squareup.com/oauth2/authorize";

    return { url: `${baseUrl}?${params.toString()}` };
  });
