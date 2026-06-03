import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncGoogleCalendar } from "@/lib/google-sync.functions";
import { syncOutlookCalendar } from "@/lib/outlook-sync.functions";
import { syncSquareBookings } from "@/lib/square-sync.functions";
import { syncCalendlyEvents } from "@/lib/calendly-sync.functions";
import { syncAcuityAppointments } from "@/lib/acuity-sync.functions";
import { syncZohoBookings } from "@/lib/zoho-sync.functions";
import { listIcalFeeds, refreshIcalFeed } from "@/lib/ical-feed.functions";

export function useAutoSyncPlatforms(enabled: boolean) {
  const hasRun = useRef(false);
  const queryClient = useQueryClient();
  const syncGoogle = useServerFn(syncGoogleCalendar);
  const syncOutlook = useServerFn(syncOutlookCalendar);
  const syncSquare = useServerFn(syncSquareBookings);
  const syncCalendly = useServerFn(syncCalendlyEvents);
  const syncAcuity = useServerFn(syncAcuityAppointments);
  const syncZoho = useServerFn(syncZohoBookings);
  const listFeeds = useServerFn(listIcalFeeds);
  const refreshFeed = useServerFn(refreshIcalFeed);

  useEffect(() => {
    if (!enabled || hasRun.current) return;

    hasRun.current = true;
    let cancelled = false;

    // Kick off iCal feed refreshes in parallel with the OAuth platform syncs.
    const icalPromise = listFeeds()
      .then(({ feeds }) =>
        Promise.allSettled(
          feeds.map((f) =>
            refreshFeed({ data: { platform: f.platform } }).then(() => true),
          ),
        ),
      )
      .catch((err) => {
        console.error("iCal feed list failed", err);
        return [] as PromiseSettledResult<boolean>[];
      });

    void Promise.allSettled([
      syncGoogle(),
      syncOutlook(),
      syncSquare(),
      syncCalendly(),
      syncAcuity(),
      syncZoho(),
    ]).then(async (results) => {
      if (cancelled) return;

      const icalResults = await icalPromise;
      const syncedAnyIcal = Array.isArray(icalResults)
        ? icalResults.some((r) => r.status === "fulfilled" && r.value)
        : false;

      const syncedAnyConnectedPlatform =
        results.some(
          (result) =>
            result.status === "fulfilled" &&
            (result.value as { connected?: boolean }).connected,
        ) || syncedAnyIcal;

      if (syncedAnyConnectedPlatform) {
        void queryClient.invalidateQueries({ queryKey: ["appointments"] });
        void queryClient.invalidateQueries({ queryKey: ["ical-feeds"] });
      }

      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Automatic platform sync failed", result.reason);
        }
      });
      if (Array.isArray(icalResults)) {
        icalResults.forEach((result) => {
          if (result.status === "rejected") {
            console.error("Automatic iCal sync failed", result.reason);
          }
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, queryClient, syncGoogle, syncOutlook, syncSquare, syncCalendly, syncAcuity, syncZoho, listFeeds, refreshFeed]);
}
