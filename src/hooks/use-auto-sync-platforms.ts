import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncGoogleCalendar } from "@/lib/google-sync.functions";
import { syncSquareBookings } from "@/lib/square-sync.functions";

export function useAutoSyncPlatforms(enabled: boolean) {
  const hasRun = useRef(false);
  const queryClient = useQueryClient();
  const syncGoogle = useServerFn(syncGoogleCalendar);
  const syncSquare = useServerFn(syncSquareBookings);

  useEffect(() => {
    if (!enabled || hasRun.current) return;

    hasRun.current = true;
    let cancelled = false;

    void Promise.allSettled([syncGoogle(), syncSquare()]).then((results) => {
      if (cancelled) return;

      const syncedAnyConnectedPlatform = results.some(
        (result) => result.status === "fulfilled" && result.value.connected,
      );

      if (syncedAnyConnectedPlatform) {
        void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      }

      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Automatic platform sync failed", result.reason);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, queryClient, syncGoogle, syncSquare]);
}