import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
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

function platformToDbKey(id: PlatformId): string {
  return id === "google" ? "google_calendar" : id;
}

function Platforms() {
  const search = useSearch({ from: "/platforms" });
  const qc = useQueryClient();
  const getAuthUrl = useServerFn(createGoogleAuthUrl);
  const list = useServerFn(listConnections);
  const disconnect = useServerFn(disconnectPlatform);

  useEffect(() => {
    if (search.google === "connected") {
      toast.success("Google Calendar connected");
    } else if (search.google === "error") {
      toast.error(`Google Calendar connection failed${search.reason ? `: ${search.reason}` : ""}`);
    }
  }, [search.google, search.reason]);

  const { data: realConnections } = useQuery({
    queryKey: ["platform-connections"],
    queryFn: () => list(),
  });

  const connectedSet = new Set(
    (realConnections?.connections ?? []).map((c) => c.platform),
  );
  const accountEmailFor = (dbKey: string) =>
    realConnections?.connections.find((c) => c.platform === dbKey)?.account_email;

  const connectGoogle = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectPlatformMut = useMutation({
    mutationFn: async (dbKey: string) => {
      await disconnect({ data: { platform: dbKey } });
    },
    onSuccess: () => {
      toast.success("Platform disconnected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const action = (id: PlatformId) => {
    if (id === "google") {
      if (connectedSet.has("google_calendar")) {
        disconnectPlatformMut.mutate("google_calendar");
      } else {
        connectGoogle.mutate();
      }
      return;
    }
    toast("Connector coming soon — Google Calendar is the only live integration right now.");
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Platforms</h1>
        <p className="text-sm text-muted-foreground">Manage your connected services.</p>
      </header>

      {connectedSet.size === 0 && (
        <div className="mb-6 rounded-md border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          No platforms connected yet. Start with Google Calendar below.
        </div>
      )}

      <div className="flex flex-col gap-6">
        {CATEGORIES.map((cat) => (
          <section key={cat.label}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {cat.label}
            </h2>
            <ul className="flex flex-col gap-2">
              {cat.ids.map((id) => {
                const p = PLATFORMS[id];
                const dbKey = platformToDbKey(id);
                const isConnected = connectedSet.has(dbKey);
                const email = isConnected ? accountEmailFor(dbKey) : undefined;
                const isGoogle = id === "google";
                const subline = isConnected
                  ? `Connected${email ? ` · ${email}` : ""}`
                  : isGoogle
                    ? "Not connected"
                    : "Coming soon";
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-md border border-l-4 bg-card p-4"
                    style={{ borderLeftColor: p.colorVar }}
                  >
                    <PlatformLogo platform={id} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{p.label}</div>
                      <div
                        className={cn(
                          "text-xs",
                          isConnected ? "text-muted-foreground" : "text-muted-foreground",
                        )}
                      >
                        {subline}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isConnected ? "outline" : "default"}
                      onClick={() => action(id)}
                      disabled={
                        isGoogle && (connectGoogle.isPending || disconnectPlatformMut.isPending)
                      }
                    >
                      {isConnected ? "Disconnect" : "Connect"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
