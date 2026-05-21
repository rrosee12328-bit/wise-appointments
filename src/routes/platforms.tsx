import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { PLATFORM_CONNECTIONS, formatTime } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { PlatformLogo } from "@/components/PlatformLogo";

export const Route = createFileRoute("/platforms")({
  head: () => ({
    meta: [
      { title: "Platforms — Jey Link" },
      { name: "description", content: "Connected booking platforms and sync status." },
      { property: "og:title", content: "Platforms — Jey Link" },
      { property: "og:description", content: "Manage Square, Booksy, TheCut, Setmore and Google Calendar connections." },
    ],
  }),
  component: Platforms,
});

function statusLabel(s: "connected" | "reauth" | "disconnected") {
  if (s === "connected") return "Connected";
  if (s === "reauth") return "Re-authenticate";
  return "Not connected";
}

const CATEGORIES: { label: string; ids: PlatformId[] }[] = [
  {
    label: "Barber",
    ids: ["thecut", "booksy", "squire", "square", "vagaro", "barberly", "ringmybarber", "goldie"],
  },
  {
    label: "Beauty & Salon",
    ids: ["glossgenius", "styleseat", "fresha", "mangomint", "boulevard", "zenoti"],
  },
  {
    label: "General scheduling",
    ids: ["acuity", "setmore", "calendly", "simplybook", "google"],
  },
];

function Platforms() {
  const [connections, setConnections] = useState(PLATFORM_CONNECTIONS);

  const action = (id: PlatformId) => {
    const c = connections.find((x) => x.id === id);
    if (!c) return;
    if (c.status === "connected") {
      toast.success(`${PLATFORMS[id].label} synced`);
      setConnections((prev) =>
        prev.map((p) => (p.id === id ? { ...p, lastSync: new Date() } : p)),
      );
    } else if (c.status === "reauth") {
      toast.success(`${PLATFORMS[id].label} reconnected`);
      setConnections((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "connected", lastSync: new Date() } : p,
        ),
      );
    } else {
      toast.success(`${PLATFORMS[id].label} connected`);
      setConnections((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "connected", lastSync: new Date() } : p,
        ),
      );
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Platforms</h1>
        <p className="text-sm text-muted-foreground">Manage your connected services.</p>
      </header>

      <div className="flex flex-col gap-6">
        {CATEGORIES.map((cat) => {
          const items = cat.ids
            .map((id) => connections.find((c) => c.id === id))
            .filter((c): c is (typeof connections)[number] => Boolean(c));
          if (items.length === 0) return null;
          return (
            <section key={cat.label}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((c) => {
                  const p = PLATFORMS[c.id];
                  return (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-l-4 bg-card p-4"
              style={{ borderLeftColor: p.colorVar }}
            >
              <PlatformLogo platform={c.id} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{p.label}</div>
                <div
                  className={cn(
                    "text-xs",
                    c.status === "connected" && "text-muted-foreground",
                    c.status === "reauth" && "text-destructive",
                    c.status === "disconnected" && "text-muted-foreground",
                  )}
                >
                  {statusLabel(c.status)}
                  {c.lastSync && c.status === "connected" && (
                    <> · synced {formatTime(c.lastSync)}</>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={c.status === "connected" ? "outline" : "default"}
                onClick={() => action(c.id)}
              >
                {c.status === "connected" && <RefreshCw className="h-3.5 w-3.5" />}
                {c.status === "connected"
                  ? "Sync now"
                  : c.status === "reauth"
                    ? "Reconnect"
                    : "Connect"}
              </Button>
            </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
