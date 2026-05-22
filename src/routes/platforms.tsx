import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { PLATFORM_CONNECTIONS, formatTime } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { PlatformLogo } from "@/components/PlatformLogo";
import { supabase } from "@/integrations/supabase/client";
import {
  createGoogleAuthUrl,
  listConnections,
  disconnectPlatform,
} from "@/lib/google-oauth.functions";

export const Route = createFileRoute("/platforms")({
  validateSearch: (s: Record<string, unknown>) => ({
    google: typeof s.google === "string" ? (s.google as string) : undefined,
    reason: typeof s.reason === "string" ? (s.reason as string) : undefined,
  }),
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
  const search = useSearch({ from: "/platforms" });
  const [connections, setConnections] = useState(PLATFORM_CONNECTIONS);
  const qc = useQueryClient();
  const getAuthUrl = useServerFn(createGoogleAuthUrl);
  const list = useServerFn(listConnections);
  const disconnect = useServerFn(disconnectPlatform);

  // Handle callback redirect toast
  useEffect(() => {
    if (search.google === "connected") {
      toast.success("Google Calendar connected");
    } else if (search.google === "error") {
      toast.error(`Google Calendar connection failed${search.reason ? `: ${search.reason}` : ""}`);
    }
  }, [search.google, search.reason]);

  // Fetch real google connection status
  const { data: realConnections } = useQuery({
    queryKey: ["platform-connections"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { connections: [] };
      return list({
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as never);
    },
  });

  const googleConn = realConnections?.connections.find((c) => c.platform === "google_calendar");

  const connectGoogle = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getAuthUrl({
        data: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as never);
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectGoogle = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      await disconnect({
        data: { platform: "google_calendar" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as never);
    },
    onSuccess: () => {
      toast.success("Google Calendar disconnected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const action = (id: PlatformId) => {
    if (id === "google") {
      if (googleConn) {
        disconnectGoogle.mutate();
      } else {
        connectGoogle.mutate();
      }
      return;
    }
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
                  const isGoogle = c.id === "google";
                  const isConnected = isGoogle ? Boolean(googleConn) : c.status === "connected";
                  const isReauth = !isGoogle && c.status === "reauth";
                  const subline = isGoogle
                    ? googleConn
                      ? `Connected${googleConn.account_email ? ` · ${googleConn.account_email}` : ""}`
                      : "Not connected"
                    : statusLabel(c.status);
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
                            isConnected && "text-muted-foreground",
                            isReauth && "text-destructive",
                            !isConnected && !isReauth && "text-muted-foreground",
                          )}
                        >
                          {subline}
                          {!isGoogle && c.lastSync && c.status === "connected" && (
                            <> · synced {formatTime(c.lastSync)}</>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isConnected ? "outline" : "default"}
                        onClick={() => action(c.id)}
                        disabled={isGoogle && (connectGoogle.isPending || disconnectGoogle.isPending)}
                      >
                        {!isGoogle && isConnected && <RefreshCw className="h-3.5 w-3.5" />}
                        {isGoogle
                          ? isConnected
                            ? "Disconnect"
                            : "Connect"
                          : isConnected
                            ? "Sync now"
                            : isReauth
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
