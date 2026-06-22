import { createFileRoute } from "@tanstack/react-router";
import { syncAllIcalFeeds } from "@/lib/ical-sync.server";

// Cron endpoint. Configure pg_cron (or any external scheduler) to call this
// every 15 minutes with `Authorization: Bearer <ICAL_CRON_SECRET>`.
//
// Stable URL:
//   POST https://project--<project-id>.lovable.app/api/public/cron/ical-sync
export const Route = createFileRoute("/api/public/cron/ical-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ICAL_CRON_SECRET;
        if (!secret) {
          return new Response("Cron secret not configured", { status: 500 });
        }
        const header = request.headers.get("authorization") ?? "";
        const provided = header.replace(/^Bearer\s+/i, "");
        if (provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const results = await syncAllIcalFeeds();
          const okCount = results.filter((r) => r.ok).length;
          const failed = results.filter((r) => !r.ok);
          return Response.json({
            ok: true,
            total: results.length,
            succeeded: okCount,
            failed: failed.length,
            errors: failed.map((f) => ({
              feedId: f.feedId,
              platform: f.platform,
              error: f.error,
            })),
          });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
