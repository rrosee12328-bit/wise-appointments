import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { verifyState } from "@/lib/oauth-state.server";

function getGoogleRedirectUri(url: URL) {
  const configuredOrigin = process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin) return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/google/callback`;

  const isLocal = url.hostname.includes("localhost");
  const origin = isLocal ? `http://${url.host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/google/callback`;
}

export const Route = createFileRoute("/api/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectTo(`/platforms?google=error&reason=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
          return redirectTo("/platforms?google=error&reason=missing_params");
        }

        const payload = verifyState(state);
        if (!payload) {
          return redirectTo("/platforms?google=error&reason=invalid_state");
        }

        const redirectUri = getGoogleRedirectUri(url);

        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("Google token exchange failed:", text);
          return redirectTo("/platforms?google=error&reason=token_exchange");
        }

        const tokens = await tokenRes.json() as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope: string;
          token_type: string;
        };

        // Fetch user email
        let accountEmail: string | null = null;
        try {
          const ures = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (ures.ok) {
            const u = await ures.json();
            accountEmail = u.email ?? null;
          }
        } catch (e) {
          console.error("Failed to fetch userinfo:", e);
        }

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        // Google only returns refresh_token on first auth or when prompt=consent.
        // If no new refresh_token was returned, preserve the existing one so
        // future auto-refreshes keep working.
        let refreshTokenToStore = tokens.refresh_token ?? null;
        if (!refreshTokenToStore) {
          const { data: existing } = await supabaseAdmin
            .from("platform_connections")
            .select("refresh_token")
            .eq("user_id", payload.userId)
            .eq("platform", "google_calendar")
            .maybeSingle();
          refreshTokenToStore = (existing?.refresh_token as string | null) ?? null;
        }

        const { error: upsertErr } = await supabaseAdmin
          .from("platform_connections")
          .upsert(
            {
              user_id: payload.userId,
              platform: "google_calendar",
              status: "connected",
              access_token: tokens.access_token,
              refresh_token: refreshTokenToStore,
              token_expires_at: expiresAt,
              account_label: accountEmail,
              metadata: {
                scope: tokens.scope,
                sync_error: null,
                sync_error_at: null,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform" },
          );

        if (upsertErr) {
          console.error("Failed to save connection:", upsertErr);
          return redirectTo("/platforms?google=error&reason=save_failed");
        }

        return redirectTo("/platforms?google=connected");
      },
    },
  },
});

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
