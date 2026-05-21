import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, RefreshCw } from "lucide-react";
import { PlatformBadge } from "@/components/PlatformBadge";
import { platformConnections, PLATFORM_LABEL } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Steady" },
      {
        name: "description",
        content:
          "Connect Google Calendar, Square, Booksy, Fresha, Acuity and Calendly to keep every platform in sync.",
      },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const [conns, setConns] = useState(platformConnections);

  const toggle = (platform: string) => {
    setConns((prev) =>
      prev.map((c) =>
        c.platform === platform
          ? {
              ...c,
              connected: !c.connected,
              syncDirection: !c.connected ? "two-way" : "off",
              lastSyncMinutesAgo: !c.connected ? 0 : undefined,
            }
          : c,
      ),
    );
    toast.success(`${PLATFORM_LABEL[platform as keyof typeof PLATFORM_LABEL]} connection updated`);
  };

  const syncNow = (platform: string) => {
    toast(`Syncing ${PLATFORM_LABEL[platform as keyof typeof PLATFORM_LABEL]}…`, {
      description: "Pulling events and pushing busy-blocks",
    });
    setTimeout(() => {
      setConns((prev) =>
        prev.map((c) =>
          c.platform === platform ? { ...c, lastSyncMinutesAgo: 0 } : c,
        ),
      );
      toast.success(`${PLATFORM_LABEL[platform as keyof typeof PLATFORM_LABEL]} synced`);
    }, 900);
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch]">
          Steady pulls bookings from each connected platform and pushes
          busy-blocks back to the others, so a booking on one app blocks the
          slot on every other.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {conns.map((c) => (
          <div
            key={c.platform}
            className={cn(
              "p-5 rounded-xl ring-1 bg-surface",
              c.connected ? "ring-black/5" : "ring-border opacity-80",
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <PlatformBadge platform={c.platform} />
                <h3 className="text-base font-semibold">
                  {PLATFORM_LABEL[c.platform]}
                </h3>
              </div>
              {c.connected && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Check className="size-3" /> Connected
                </span>
              )}
            </div>

            {c.connected ? (
              <dl className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div>
                  <dt className="text-muted-foreground">Sync</dt>
                  <dd className="font-semibold capitalize">{c.syncDirection}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Events</dt>
                  <dd className="font-semibold">{c.eventsPulled ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last sync</dt>
                  <dd className="font-semibold">
                    {c.lastSyncMinutesAgo === 0
                      ? "just now"
                      : `${c.lastSyncMinutesAgo}m ago`}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground mb-4">
                Not connected. Bookings on this platform won't be visible in
                Steady and won't be blocked when you book elsewhere.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => toggle(c.platform)}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-md flex-1",
                  c.connected
                    ? "ring-1 ring-border hover:bg-muted"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {c.connected ? "Disconnect" : "Connect"}
              </button>
              {c.connected && (
                <button
                  onClick={() => syncNow(c.platform)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md ring-1 ring-border hover:bg-muted inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="size-3" />
                  Sync now
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
