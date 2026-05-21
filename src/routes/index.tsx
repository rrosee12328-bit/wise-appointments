import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { PlatformBadge } from "@/components/PlatformBadge";
import barberStation from "@/assets/barber-station.jpg";
import {
  todayAppointments,
  platformConnections,
  PLATFORM_LABEL,
} from "@/lib/mock-data";
import { findConflicts, formatMin, isInConflict } from "@/lib/conflicts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today's Schedule — Steady" },
      {
        name: "description",
        content:
          "Your unified daily schedule across every booking platform — with instant conflict alerts.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const conflicts = useMemo(() => findConflicts(todayAppointments), []);
  const activeChannels = platformConnections.filter((p) => p.connected).length;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {conflicts.length > 0 && (
        <section className="mb-10">
          {conflicts.map(({ a, b }, i) => (
            <div
              key={i}
              className="bg-warning-surface ring-1 ring-warning/30 rounded-xl p-5 flex items-start gap-4 mb-3"
            >
              <div className="size-8 bg-warning rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="size-4 text-warning-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-warning-foreground">
                  Schedule conflict detected
                </h3>
                <p className="text-sm text-warning-foreground/80 mt-1 max-w-[60ch]">
                  Double booking at {formatMin(a.start)}: {a.service} (
                  {PLATFORM_LABEL[a.source]}) overlaps with {b.service} (
                  {PLATFORM_LABEL[b.source]}).
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() =>
                      toast.success("Pushed cancellation to all platforms", {
                        description: `${b.client}'s appointment removed`,
                      })
                    }
                    className="text-xs font-semibold px-3 py-1.5 bg-warning text-warning-foreground rounded"
                  >
                    Resolve now
                  </button>
                  <button className="text-xs font-semibold px-3 py-1.5 text-warning-foreground/80 hover:bg-warning/10 rounded">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1 min-w-0">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h1>
            <p className="text-muted-foreground mt-2">
              {todayAppointments.length} appointments today across{" "}
              {activeChannels} linked platforms.
            </p>
          </header>

          <div className="space-y-3">
            {todayAppointments.map((appt) => {
              const conflicted = isInConflict(appt, conflicts);
              return (
                <div
                  key={appt.id}
                  className={cn(
                    "group relative flex items-center gap-4 p-4 rounded-xl ring-1 transition-colors",
                    conflicted
                      ? "bg-warning-surface ring-warning/40"
                      : "bg-surface-muted ring-black/5 hover:ring-black/10",
                  )}
                >
                  <div className="w-16 shrink-0">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        conflicted
                          ? "text-warning-foreground font-bold"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatMin(appt.start)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate">
                      {appt.client}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {appt.service}
                      {appt.price ? ` · $${appt.price}` : ""}
                    </p>
                  </div>
                  <PlatformBadge platform={appt.source} />
                </div>
              );
            })}
          </div>
        </div>

        <aside className="w-full lg:w-72 shrink-0 space-y-8">
          <MonthMini />

          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Active Channels
            </h3>
            <div className="divide-y divide-border">
              {platformConnections.map((c) => (
                <div
                  key={c.platform}
                  className="py-3 flex items-center justify-between"
                >
                  <span
                    className={cn(
                      "text-sm font-medium",
                      !c.connected && "text-muted-foreground",
                    )}
                  >
                    {PLATFORM_LABEL[c.platform]}
                  </span>
                  {c.connected ? (
                    <div className="size-1.5 rounded-full bg-emerald-500" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      OFF
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() =>
              toast("New appointment", {
                description: "Pushing to Google, Square, Booksy…",
              })
            }
            className="w-full text-sm font-medium bg-primary text-primary-foreground py-2.5 rounded-md flex items-center justify-center gap-2 hover:bg-accent transition-colors"
          >
            <Plus className="size-4" />
            New Appointment
          </button>

          <div className="w-full aspect-square overflow-hidden rounded-xl ring-1 ring-black/5">
            <img
              src={barberStation}
              alt="Barber station with tools laid out on dark wood"
              width={768}
              height={768}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function MonthMini() {
  const today = new Date();
  const day = today.getDate();
  const days = Array.from({ length: 7 }, (_, i) => day - 3 + i);
  return (
    <div className="p-5 bg-surface ring-1 ring-black/5 rounded-xl">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
        This Week
      </h3>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span
            key={i}
            className="text-[10px] text-muted-foreground font-medium"
          >
            {d}
          </span>
        ))}
        {days.map((d) => (
          <div
            key={d}
            className={cn(
              "aspect-square flex items-center justify-center text-xs rounded-full",
              d === day
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-foreground/80 hover:bg-muted cursor-pointer",
            )}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}
