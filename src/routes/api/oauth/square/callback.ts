import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { verifyState } from "@/lib/oauth-state.server";

function getSquareRedirectUri(url: URL) {
  const configuredOrigin = process.env.SQUARE_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin)
    return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/square/callback`;
  const isLocal = url.hostname.includes("localhost");
  const origin = isLocal ? `http://${url.host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/square/callback`;
}

export const Route = createFileRoute("/api/oauth/square/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectTo(
            `/platforms?square=error&reason=${encodeURIComponent(error)}`,
          );
        }

        if (!code || !state) {
          return redirectTo("/platforms?square=error&reason=missing_params");
        }

        const payload = verifyState(state);
        if (!payload) {
          return redirectTo("/platforms?square=error&reason=invalid_state");
        }

        const redirectUri = getSquareRedirectUri(url);

        // Exchange authorization code for tokens
        const issandbox = process.env.SQUARE_ENVIRONMENT === "sandbox";
        const tokenEndpoint = issandbox
          ? "https://connect.squareupsandbox.com/oauth2/token"
          : "https://connect.squareup.com/oauth2/token";

        const tokenRes = await fetch(tokenEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Square-Version": "2024-01-18",
          },
          body: JSON.stringify({
            client_id: process.env.SQUARE_OAUTH_CLIENT_ID!,
            client_secret: process.env.SQUARE_OAUTH_CLIENT_SECRET!,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("Square token exchange failed:", text);
          return redirectTo("/platforms?square=error&reason=token_exchange");
        }

        const tokens = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_at?: string;
          merchant_id?: string;
          token_type: string;
        };

        // Fetch merchant info to get the business name / email
        let accountLabel: string | null = null;
        try {
          const merchantEndpoint = issandbox
            ? "https://connect.squareupsandbox.com/v2/merchants/me"
            : "https://connect.squareup.com/v2/merchants/me";

          const mRes = await fetch(merchantEndpoint, {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "Square-Version": "2024-01-18",
            },
          });
          if (mRes.ok) {
            const mData = (await mRes.json()) as {
              merchant?: { business_name?: string; email?: string };
            };
            accountLabel =
              mData.merchant?.business_name ??
              mData.merchant?.email ??
              tokens.merchant_id ??
              null;
          }
        } catch (e) {
          console.error("Failed to fetch Square merchant info:", e);
        }

        // Square tokens expire_at is an ISO string; fall back to 30 days
        const expiresAt =
          tokens.expires_at ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error: upsertErr } = await supabaseAdmin
          .from("platform_connections")
          .upsert(
            {
              user_id: payload.userId,
              platform: "square",
              status: "connected",
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token ?? null,
              token_expires_at: expiresAt,
              account_label: accountLabel,
              metadata: { merchant_id: tokens.merchant_id ?? null },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform" },
          );

        if (upsertErr) {
          console.error("Failed to save Square connection:", upsertErr);
          return redirectTo("/platforms?square=error&reason=save_failed");
        }

        return redirectTo("/platforms?square=connected");
      },
    },
  },
});

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
