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
import { createSquareAuthUrl } from "@/lib/square-oauth.functions";
import { createCalendlyAuthUrl } from "@/lib/calendly-oauth.functions";
import { createAcuityAuthUrl } from "@/lib/acuity-oauth.functions";
import { createZohoAuthUrl } from "@/lib/zoho-oauth.functions";

export const Route = createFileRoute("/platforms")({
  validateSearch: (s: Record<string, unknown>) => ({
    google: typeof s.google === "string" ? (s.google as string) : undefined,
    square: typeof s.square === "string" ? (s.square as string) : undefined,
    calendly: typeof s.calendly === "string" ? (s.calendly as string) : undefined,
    acuity: typeof s.acuity === "string" ? (s.acuity as string) : undefined,
    zoho: typeof s.zoho === "string" ? (s.zoho as string) : undefined,
    reason: typeof s.reason === "string" ? (s.reason as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Platforms — Jey Link" },
      { name: "description", content: "Connected booking platforms and sync status." },
      { property: "og:title", content: "Platforms — Jey Link" },
      {
        property: "og:description",
        content:
          "Manage Square, Booksy, TheCut, Setmore and Google Calendar connections.",
      },
    ],
  }),
  component: Platforms,
});

const CATEGORIES: { label: string; ids: PlatformId[] }[] = [
  {
    label: "Barber",
    ids: [
      "thecut",
      "booksy",
      "squire",
      "square",
      "vagaro",
      "barberly",
      "ringmybarber",
      "goldie",
    ],
  },
  {
    label: "Beauty & Salon",
    ids: ["glossgenius", "styleseat", "fresha", "mangomint", "boulevard", "zenoti"],
  },
  {
    label: "General scheduling",
    ids: ["acuity", "setmore", "calendly", "simplybook", "zoho", "google"],
  },
];

// Platforms that have a live OAuth integration
const LIVE_PLATFORMS = new Set<PlatformId>(["google", "square", "calendly", "acuity", "zoho"]);

function platformToDbKey(id: PlatformId): string {
  return id === "google" ? "google_calendar" : id;
}

function Platforms() {
  const search = useSearch({ from: "/platforms" });
  const qc = useQueryClient();
  const getGoogleAuthUrl = useServerFn(createGoogleAuthUrl);
  const getSquareAuthUrl = useServerFn(createSquareAuthUrl);
  const getCalendlyAuthUrl = useServerFn(createCalendlyAuthUrl);
  const getAcuityAuthUrl = useServerFn(createAcuityAuthUrl);
  const getZohoAuthUrl = useServerFn(createZohoAuthUrl);
  const list = useServerFn(listConnections);
  const disconnect = useServerFn(disconnectPlatform);

  // Toast notifications for OAuth callbacks
  useEffect(() => {
    if (search.google === "connected") {
      toast.success("Google Calendar connected");
    } else if (search.google === "error") {
      toast.error(
        `Google Calendar connection failed${search.reason ? `: ${search.reason}` : ""}`,
      );
    }
  }, [search.google, search.reason]);

  useEffect(() => {
    if (search.zoho === "connected") {
      toast.success("Zoho Bookings connected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    } else if (search.zoho === "error") {
      toast.error(
        `Zoho Bookings connection failed${search.reason ? `: ${search.reason}` : ""}`,
      );
    }
  }, [search.zoho, search.reason, qc]);

  useEffect(() => {
    if (search.acuity === "connected") {
      toast.success("Acuity connected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    } else if (search.acuity === "error") {
      toast.error(
        `Acuity connection failed${search.reason ? `: ${search.reason}` : ""}`,
      );
    }
  }, [search.acuity, search.reason, qc]);

  useEffect(() => {
    if (search.calendly === "connected") {
      toast.success("Calendly connected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    } else if (search.calendly === "error") {
      toast.error(
        `Calendly connection failed${search.reason ? `: ${search.reason}` : ""}`,
      );
    }
  }, [search.calendly, search.reason, qc]);

  useEffect(() => {
    if (search.square === "connected") {
      toast.success("Square connected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    } else if (search.square === "error") {
      toast.error(
        `Square connection failed${search.reason ? `: ${search.reason}` : ""}`,
      );
    }
  }, [search.square, search.reason, qc]);

  const { data: realConnections } = useQuery({
    queryKey: ["platform-connections"],
    queryFn: () => list(),
  });

  const connectedSet = new Set(
    (realConnections?.connections ?? []).map((c) => c.platform),
  );
  const accountLabelFor = (dbKey: string) =>
    realConnections?.connections.find((c) => c.platform === dbKey)?.account_email;

  // Google connect
  const connectGoogle = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getGoogleAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Zoho connect
  const connectZoho = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getZohoAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Acuity connect
  const connectAcuity = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getAcuityAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Calendly connect
  const connectCalendly = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getCalendlyAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Square connect
  const connectSquare = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getSquareAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Generic disconnect
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
    const dbKey = platformToDbKey(id);

    if (id === "google") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        connectGoogle.mutate();
      }
      return;
    }

    if (id === "square") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        connectSquare.mutate();
      }
      return;
    }

    if (id === "calendly") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        connectCalendly.mutate();
      }
      return;
    }

    if (id === "acuity") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        connectAcuity.mutate();
      }
      return;
    }

    if (id === "zoho") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        connectZoho.mutate();
      }
      return;
    }

    toast("Connector coming soon.");
  };

  const isActionPending = (id: PlatformId) => {
    if (id === "google")
      return connectGoogle.isPending || disconnectPlatformMut.isPending;
    if (id === "square")
      return connectSquare.isPending || disconnectPlatformMut.isPending;
    if (id === "calendly")
      return connectCalendly.isPending || disconnectPlatformMut.isPending;
    if (id === "acuity")
      return connectAcuity.isPending || disconnectPlatformMut.isPending;
    if (id === "zoho")
      return connectZoho.isPending || disconnectPlatformMut.isPending;
    return false;
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Platforms</h1>
        <p className="text-sm text-muted-foreground">
          Manage your connected services.
        </p>
      </header>

      {connectedSet.size === 0 && (
        <div className="mb-6 rounded-md border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          No platforms connected yet. Connect Square or Google Calendar below.
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
                const label = isConnected ? accountLabelFor(dbKey) : undefined;
                const isLive = LIVE_PLATFORMS.has(id);
                const subline = isConnected
                  ? `Connected${label ? ` · ${label}` : ""}`
                  : isLive
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
                      <div className="text-sm font-medium text-foreground">
                        {p.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {subline}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isConnected ? "outline" : isLive ? "default" : "ghost"}
                      onClick={() => action(id)}
                      disabled={!isLive || isActionPending(id)}
                      className={cn(!isLive && "cursor-not-allowed opacity-50")}
                    >
                      {isConnected ? "Disconnect" : isLive ? "Connect" : "Soon"}
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
