import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { verifyState } from "@/lib/oauth-state.server";

const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";

function getZohoRedirectUri(url: URL) {
  const configuredOrigin = process.env.ZOHO_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin) return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/zoho/callback`;
  const isLocal = url.hostname.includes("localhost");
  const origin = isLocal ? `http://${url.host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/zoho/callback`;
}

export const Route = createFileRoute("/api/oauth/zoho/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectTo(`/platforms?zoho=error&reason=${encodeURIComponent(error)}`);
        }

        if (!code || !state) {
          return redirectTo("/platforms?zoho=error&reason=missing_params");
        }

        const payload = verifyState(state);
        if (!payload) {
          return redirectTo("/platforms?zoho=error&reason=invalid_state");
        }

        const redirectUri = getZohoRedirectUri(url);

        // Exchange authorization code for tokens
        const tokenRes = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.ZOHO_OAUTH_CLIENT_ID!,
            client_secret: process.env.ZOHO_OAUTH_CLIENT_SECRET!,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("Zoho token exchange failed:", text);
          return redirectTo("/platforms?zoho=error&reason=token_exchange");
        }

        const tokens = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type: string;
          scope?: string;
          api_domain?: string;
          error?: string;
        };

        if (tokens.error) {
          console.error("Zoho token error:", tokens);
          return redirectTo("/platforms?zoho=error&reason=token_error");
        }

        // Fetch user info to get account label
        let accountLabel: string | null = null;
        const apiDomain = tokens.api_domain ?? "https://www.zohoapis.com";

        try {
          const userRes = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/user/info`, {
            headers: {
              Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
            },
          });
          if (userRes.ok) {
            const userData = (await userRes.json()) as {
              Display_Name?: string;
              Email?: string;
            };
            accountLabel = userData.Display_Name ?? userData.Email ?? null;
          }
        } catch (e) {
          console.error("Failed to fetch Zoho user info:", e);
        }

        // Zoho access tokens expire in 1 hour
        const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

        const { error: upsertErr } = await supabaseAdmin.from("platform_connections").upsert(
          {
            user_id: payload.userId,
            platform: "zoho",
            status: "connected",
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expires_at: expiresAt,
            account_label: accountLabel,
            metadata: {
              api_domain: apiDomain,
              scope: tokens.scope ?? null,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform" },
        );

        if (upsertErr) {
          console.error("Failed to save Zoho connection:", upsertErr);
          return redirectTo("/platforms?zoho=error&reason=save_failed");
        }

        return redirectTo("/platforms?zoho=connected");
      },
    },
  },
});

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
