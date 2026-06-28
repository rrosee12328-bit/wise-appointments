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
import { syncAppointmentBlocks } from "@/lib/appointment-writeback.functions";

const ACTIVE_SYNC_INTERVAL_MS = 15 * 1000;
const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const MIN_SYNC_SPACING_MS = 12 * 1000;

export function useAutoSyncPlatforms(enabled: boolean) {
  const hasRun = useRef(false);
  const inFlight = useRef(false);
  const lastStartedAt = useRef(0);
  const queryClient = useQueryClient();
  const syncGoogle = useServerFn(syncGoogleCalendar);
  const syncOutlook = useServerFn(syncOutlookCalendar);
  const syncSquare = useServerFn(syncSquareBookings);
  const syncCalendly = useServerFn(syncCalendlyEvents);
  const syncAcuity = useServerFn(syncAcuityAppointments);
  const syncZoho = useServerFn(syncZohoBookings);
  const listFeeds = useServerFn(listIcalFeeds);
  const refreshFeed = useServerFn(refreshIcalFeed);
  const syncBlocks = useServerFn(syncAppointmentBlocks);

  useEffect(() => {
    if (!enabled) return;

    function shouldUseBackgroundCadence() {
      return typeof document !== "undefined" && document.visibilityState !== "visible";
    }

    async function runSync(cancelled: { value: boolean }, force = false) {
      if (inFlight.current) return;
      const now = Date.now();
      if (!force && now - lastStartedAt.current < MIN_SYNC_SPACING_MS) return;

      inFlight.current = true;
      lastStartedAt.current = now;

      // Kick off iCal feed refreshes in parallel with the OAuth platform syncs.
      const icalPromise = listFeeds()
        .then(({ feeds }) =>
          Promise.allSettled(
            feeds.map((f) => refreshFeed({ data: { platform: f.platform } }).then(() => true)),
          ),
        )
        .catch((err) => {
          console.error("iCal feed list failed", err);
          return [] as PromiseSettledResult<boolean>[];
        });

      try {
        const results = await Promise.allSettled([
          syncGoogle(),
          syncOutlook(),
          syncSquare(),
          syncCalendly(),
          syncAcuity(),
          syncZoho(),
        ]);
        const blockResult = await syncBlocks().catch((err) => {
          console.error("Automatic block sync failed", err);
          return null;
        });

        if (cancelled.value) return;

        const icalResults = await icalPromise;
        const syncedAnyIcal = Array.isArray(icalResults)
          ? icalResults.some((r) => r.status === "fulfilled" && r.value)
          : false;

        const syncedAnyConnectedPlatform =
          results.some((result) => {
            if (
              result.status !== "fulfilled" ||
              !result.value ||
              typeof result.value !== "object"
            ) {
              return false;
            }

            return Boolean((result.value as { connected?: boolean }).connected);
          }) ||
          syncedAnyIcal ||
          Boolean(blockResult?.googleUpdated || blockResult?.outlookUpdated);

        if (syncedAnyConnectedPlatform) {
          void queryClient.invalidateQueries({ queryKey: ["appointments"] });
          void queryClient.invalidateQueries({ queryKey: ["ical-feeds"] });
          // Also refresh platform connection status (last_synced_at, sync_error)
          void queryClient.invalidateQueries({ queryKey: ["platform-connections"] });
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
      } finally {
        inFlight.current = false;
      }
    }

    const cancelled = { value: false };

    // Run immediately on first mount
    if (!hasRun.current) {
      hasRun.current = true;
      void runSync(cancelled, true);
    }

    // Then keep the active app close to realtime. Hidden tabs back off.
    const intervalId = setInterval(() => {
      if (!cancelled.value) {
        const elapsed = Date.now() - lastStartedAt.current;
        const cadence = shouldUseBackgroundCadence()
          ? BACKGROUND_SYNC_INTERVAL_MS
          : ACTIVE_SYNC_INTERVAL_MS;
        if (elapsed >= cadence) void runSync(cancelled);
      }
    }, ACTIVE_SYNC_INTERVAL_MS);

    const syncOnReturn = () => {
      if (!cancelled.value && !shouldUseBackgroundCadence()) {
        void runSync(cancelled, true);
      }
    };

    window.addEventListener("focus", syncOnReturn);
    document.addEventListener("visibilitychange", syncOnReturn);

    return () => {
      cancelled.value = true;
      clearInterval(intervalId);
      window.removeEventListener("focus", syncOnReturn);
      document.removeEventListener("visibilitychange", syncOnReturn);
    };
  }, [
    enabled,
    queryClient,
    syncGoogle,
    syncOutlook,
    syncSquare,
    syncCalendly,
    syncAcuity,
    syncZoho,
    listFeeds,
    refreshFeed,
    syncBlocks,
  ]);
}
