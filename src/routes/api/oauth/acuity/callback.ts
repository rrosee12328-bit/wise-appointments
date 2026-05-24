import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

function getAcuityRedirectUri(url: URL) {
  const configuredOrigin = process.env.ACUITY_OAUTH_REDIRECT_ORIGIN;
  if (configuredOrigin)
    return `${configuredOrigin.replace(/\/$/, "")}/api/oauth/acuity/callback`;
  const isLocal = url.hostname.includes("localhost");
  const origin = isLocal ? `http://${url.host}` : "https://jeylink.vektiss.com";
  return `${origin}/api/oauth/acuity/callback`;
}

export const Route = createFileRoute("/api/oauth/acuity/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectTo(
            `/platforms?acuity=error&reason=${encodeURIComponent(error)}`,
          );
        }

        if (!code) {
          return redirectTo("/platforms?acuity=error&reason=missing_code");
        }

        // Acuity doesn't support state param — find the most recent pending connection
        const { data: pending, error: pendingErr } = await supabaseAdmin
          .from("platform_connections")
          .select("user_id")
          .eq("platform", "acuity_pending")
          .eq("status", "pending")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingErr || !pending) {
          return redirectTo("/platforms?acuity=error&reason=no_pending_session");
        }

        const userId = pending.user_id;

        const redirectUri = getAcuityRedirectUri(url);

        // Clean up the pending row
        await supabaseAdmin
          .from("platform_connections")
          .delete()
          .eq("user_id", userId)
          .eq("platform", "acuity_pending");

        // Exchange authorization code for tokens
        const tokenRes = await fetch("https://acuityscheduling.com/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.ACUITY_OAUTH_CLIENT_ID!,
            client_secret: process.env.ACUITY_OAUTH_CLIENT_SECRET!,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("Acuity token exchange failed:", text);
          return redirectTo("/platforms?acuity=error&reason=token_exchange");
        }

        const tokens = (await tokenRes.json()) as {
          access_token: string;
          token_type: string;
        };

        // Fetch user info using the /me endpoint
        let accountLabel: string | null = null;
        let userId_acuity: number | null = null;

        try {
          const meRes = await fetch("https://acuityscheduling.com/api/v1/me", {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          });
          if (meRes.ok) {
            const meData = (await meRes.json()) as {
              id?: number;
              name?: string;
              email?: string;
            };
            accountLabel = meData.name ?? meData.email ?? null;
            userId_acuity = meData.id ?? null;
          }
        } catch (e) {
          console.error("Failed to fetch Acuity user info:", e);
        }

        // Acuity access tokens don't expire (they're long-lived)
        // Set a far-future expiry as a placeholder
        const expiresAt = new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { error: upsertErr } = await supabaseAdmin
          .from("platform_connections")
          .upsert(
            {
              user_id: userId,
              platform: "acuity",
              status: "connected",
              access_token: tokens.access_token,
              refresh_token: null,
              token_expires_at: expiresAt,
              account_label: accountLabel,
              metadata: { acuity_user_id: userId_acuity },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform" },
          );

        if (upsertErr) {
          console.error("Failed to save Acuity connection:", upsertErr);
          return redirectTo("/platforms?acuity=error&reason=save_failed");
        }

        return redirectTo("/platforms?acuity=connected");
      },
    },
  },
});

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
