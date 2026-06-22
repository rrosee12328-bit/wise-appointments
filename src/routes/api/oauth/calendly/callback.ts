import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { verifyState } from "@/lib/oauth-state.server";

function getCalendlyRedirectUri(url: URL) {
  const configuredOrigin = process.env.CALENDLY_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin) return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/calendly/callback`;
  const isLocal = url.hostname.includes("localhost");
  const origin = isLocal ? `http://${url.host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/calendly/callback`;
}

export const Route = createFileRoute("/api/oauth/calendly/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectTo(`/platforms?calendly=error&reason=${encodeURIComponent(error)}`);
        }

        if (!code || !state) {
          return redirectTo("/platforms?calendly=error&reason=missing_params");
        }

        const payload = verifyState(state);
        if (!payload) {
          return redirectTo("/platforms?calendly=error&reason=invalid_state");
        }

        const redirectUri = getCalendlyRedirectUri(url);

        // Exchange authorization code for tokens
        const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.CALENDLY_OAUTH_CLIENT_ID!,
            client_secret: process.env.CALENDLY_OAUTH_CLIENT_SECRET!,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("Calendly token exchange failed:", text);
          return redirectTo("/platforms?calendly=error&reason=token_exchange");
        }

        const tokens = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type: string;
          scope?: string;
          organization?: string;
          owner?: string;
        };

        // Fetch user info to get name/email for account label
        let accountLabel: string | null = null;
        let userUri: string | null = null;
        let orgUri: string | null = null;

        try {
          const userRes = await fetch("https://api.calendly.com/users/me", {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "Content-Type": "application/json",
            },
          });
          if (userRes.ok) {
            const userData = (await userRes.json()) as {
              resource?: {
                name?: string;
                email?: string;
                uri?: string;
                current_organization?: string;
              };
            };
            accountLabel = userData.resource?.name ?? userData.resource?.email ?? null;
            userUri = userData.resource?.uri ?? null;
            orgUri = userData.resource?.current_organization ?? null;
          }
        } catch (e) {
          console.error("Failed to fetch Calendly user info:", e);
        }

        // Calendly tokens expire in 2 hours by default
        const expiresAt = tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

        const { error: upsertErr } = await supabaseAdmin.from("platform_connections").upsert(
          {
            user_id: payload.userId,
            platform: "calendly",
            status: "connected",
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expires_at: expiresAt,
            account_label: accountLabel,
            metadata: {
              user_uri: userUri,
              organization_uri: orgUri,
              scope: tokens.scope ?? null,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform" },
        );

        if (upsertErr) {
          console.error("Failed to save Calendly connection:", upsertErr);
          return redirectTo("/platforms?calendly=error&reason=save_failed");
        }

        return redirectTo("/platforms?calendly=connected");
      },
    },
  },
});

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
