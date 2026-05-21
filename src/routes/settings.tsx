import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { workingHours } from "@/lib/mock-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Steady" },
      {
        name: "description",
        content: "Working hours, breaks, time-off and sync rules.",
      },
    ],
  }),
  component: SettingsPage,
});

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function SettingsPage() {
  const [hours, setHours] = useState(workingHours);
  const [blockOnAll, setBlockOnAll] = useState(true);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Tell Steady when you're available and how aggressively to block other
          platforms.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Working hours
        </h2>
        <div className="rounded-xl ring-1 ring-border bg-surface divide-y divide-border">
          {DAYS.map((day) => {
            const h = hours[day];
            return (
              <div
                key={day}
                className="flex items-center gap-4 px-4 py-3 flex-wrap"
              >
                <label className="inline-flex items-center gap-2 w-32">
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...h, enabled: e.target.checked },
                      }))
                    }
                  />
                  <span className="text-sm font-medium capitalize">{day}</span>
                </label>
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    type="time"
                    value={h.open}
                    disabled={!h.enabled}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...h, open: e.target.value },
                      }))
                    }
                    className="px-2 py-1 text-sm rounded ring-1 ring-border bg-background disabled:opacity-50"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input
                    type="time"
                    value={h.close}
                    disabled={!h.enabled}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...h, close: e.target.value },
                      }))
                    }
                    className="px-2 py-1 text-sm rounded ring-1 ring-border bg-background disabled:opacity-50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Sync rules
        </h2>
        <div className="rounded-xl ring-1 ring-border bg-surface p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={blockOnAll}
              onChange={(e) => setBlockOnAll(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-semibold">
                Block time-off on every connected platform
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[60ch]">
                When you mark personal time, push a busy-block to Google,
                Square, Booksy, Fresha, Acuity and Calendly so clients can't
                book over it.
              </p>
            </div>
          </label>
        </div>
      </section>
    </main>
  );
}
