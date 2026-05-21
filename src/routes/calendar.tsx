import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlatformBadge } from "@/components/PlatformBadge";
import { todayAppointments, PLATFORM_LABEL } from "@/lib/mock-data";
import { findConflicts, formatMin, isInConflict } from "@/lib/conflicts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Unified Calendar — Steady" },
      {
        name: "description",
        content:
          "Day, week, and month view of every appointment across every connected platform.",
      },
    ],
  }),
  component: CalendarPage,
});

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8am - 7pm

function CalendarPage() {
  const [view, setView] = useState<"day" | "week">("day");
  const conflicts = useMemo(() => findConflicts(todayAppointments), []);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-2">
            Every booking, every platform, one view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md ring-1 ring-border overflow-hidden">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold capitalize",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded hover:bg-muted">
              <ChevronLeft className="size-4" />
            </button>
            <button className="text-xs font-semibold px-3 py-1.5 rounded hover:bg-muted">
              Today
            </button>
            <button className="p-1.5 rounded hover:bg-muted">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-border bg-surface overflow-hidden">
        <div className="grid grid-cols-[64px_1fr]">
          {HOURS.map((h) => {
            const start = h * 60;
            const end = (h + 1) * 60;
            const inSlot = todayAppointments.filter(
              (a) => a.start < end && a.end > start,
            );
            return (
              <div key={h} className="contents">
                <div className="border-t border-border/60 px-3 py-3 text-[11px] font-mono text-muted-foreground">
                  {((h + 11) % 12) + 1}
                  <span className="ml-0.5">{h >= 12 ? "PM" : "AM"}</span>
                </div>
                <div className="border-t border-border/60 px-3 py-2 min-h-16 space-y-1.5">
                  {inSlot.length === 0 ? (
                    <div className="h-12" />
                  ) : (
                    inSlot.map((a) => {
                      const conflicted = isInConflict(a, conflicts);
                      return (
                        <div
                          key={a.id}
                          className={cn(
                            "rounded-lg p-3 ring-1 flex items-center gap-3",
                            conflicted
                              ? "bg-warning-surface ring-warning/40"
                              : "bg-background ring-black/5",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-mono text-muted-foreground">
                                {formatMin(a.start)} – {formatMin(a.end)}
                              </span>
                              {conflicted && (
                                <span className="text-[10px] font-bold uppercase text-warning-foreground">
                                  Conflict
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold truncate">
                              {a.client}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {a.service}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <PlatformBadge platform={a.source} />
                            <span className="text-[10px] text-muted-foreground hidden sm:block">
                              synced → {a.syncedTo.length}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="mr-2">Sources:</span>
        {(
          ["google", "square", "booksy", "fresha", "acuity", "calendly"] as const
        ).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <PlatformBadge platform={p} />
          </span>
        ))}
        {view === "week" && (
          <span className="basis-full mt-2 text-muted-foreground">
            Week view coming soon — showing today's agenda.
          </span>
        )}
        <span className="sr-only">{PLATFORM_LABEL.steady}</span>
      </div>
    </main>
  );
}
