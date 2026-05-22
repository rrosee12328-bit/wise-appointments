import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { verifyState } from "@/lib/oauth-state.server";

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

        const proto = url.hostname.includes("localhost") ? "http" : "https";
        const redirectUri = `${proto}://${url.host}/api/oauth/google/callback`;

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

        const { error: upsertErr } = await supabaseAdmin
          .from("platform_connections")
          .upsert(
            {
              user_id: payload.userId,
              platform: "google_calendar",
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token ?? null,
              expires_at: expiresAt,
              scope: tokens.scope,
              account_email: accountEmail,
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
