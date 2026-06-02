import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { verifyState } from "@/lib/oauth-state.server";
import { getOutlookRedirectUri } from "@/lib/outlook-oauth.functions";

export const Route = createFileRoute("/api/oauth/outlook/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectTo(`/platforms?outlook=error&reason=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
          return redirectTo("/platforms?outlook=error&reason=missing_params");
        }

        const payload = verifyState(state);
        if (!payload) {
          return redirectTo("/platforms?outlook=error&reason=invalid_state");
        }

        const redirectUri = getOutlookRedirectUri(url.host);

        const tokenRes = await fetch(
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: process.env.OUTLOOK_OAUTH_CLIENT_ID!,
              client_secret: process.env.OUTLOOK_OAUTH_CLIENT_SECRET!,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          },
        );

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("Outlook token exchange failed:", text);
          return redirectTo("/platforms?outlook=error&reason=token_exchange");
        }

        const tokens = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope: string;
          token_type: string;
        };

        let accountEmail: string | null = null;
        try {
          const ures = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (ures.ok) {
            const u = (await ures.json()) as { mail?: string; userPrincipalName?: string };
            accountEmail = u.mail ?? u.userPrincipalName ?? null;
          }
        } catch (e) {
          console.error("Failed to fetch Outlook userinfo:", e);
        }

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        const { error: upsertErr } = await supabaseAdmin
          .from("platform_connections")
          .upsert(
            {
              user_id: payload.userId,
              platform: "outlook_calendar",
              status: "connected",
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token ?? null,
              token_expires_at: expiresAt,
              account_label: accountEmail,
              metadata: { scope: tokens.scope },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform" },
          );

        if (upsertErr) {
          console.error("Failed to save Outlook connection:", upsertErr);
          return redirectTo("/platforms?outlook=error&reason=save_failed");
        }

        return redirectTo("/platforms?outlook=connected");
      },
    },
  },
});

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
