import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PLATFORMS, PLATFORM_TIER, tierNote, tierShortLabel, supportsIcal, type PlatformId } from "@/lib/platforms";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlatformLogo } from "@/components/PlatformLogo";
import { ApiKeyConnectDialog } from "@/components/ApiKeyConnectDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createGoogleAuthUrl,
  listConnections,
  disconnectPlatform,
} from "@/lib/google-oauth.functions";
import { createOutlookAuthUrl } from "@/lib/outlook-oauth.functions";
import { createSquareAuthUrl } from "@/lib/square-oauth.functions";
import { createCalendlyAuthUrl } from "@/lib/calendly-oauth.functions";
import { createAcuityAuthUrl } from "@/lib/acuity-oauth.functions";
import { createZohoAuthUrl } from "@/lib/zoho-oauth.functions";
import { connectClinikoApiKey } from "@/lib/cliniko-apikey.functions";
import { connectZenotiApiKey } from "@/lib/zenoti-apikey.functions";
import { linkPlatform } from "@/lib/platform-link.functions";
import {
  connectIcalFeed,
  disconnectIcalFeed,
  listIcalFeeds,
  refreshIcalFeed,
} from "@/lib/ical-feed.functions";
import { LinkPlatformDialog } from "@/components/LinkPlatformDialog";


export const Route = createFileRoute("/platforms")({
  validateSearch: (s: Record<string, unknown>) => ({
    google: typeof s.google === "string" ? (s.google as string) : undefined,
    outlook: typeof s.outlook === "string" ? (s.outlook as string) : undefined,
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
    ids: ["acuity", "setmore", "calendly", "simplybook", "zoho", "cliniko", "google", "outlook"],
  },
];

// Platforms that have a live OAuth integration (redirect flow)
const OAUTH_PLATFORMS = new Set<PlatformId>(["google", "outlook", "square", "calendly", "acuity", "zoho"]);

// Platforms that use API key modal
const APIKEY_PLATFORMS = new Set<PlatformId>(["cliniko", "zenoti"]);

// Relay-only platforms: user provides a booking-page handle, bookings flow
// through Google/Outlook Calendar.
const RELAY_PLATFORMS = new Set<PlatformId>([
  "booksy", "thecut", "setmore", "squire", "vagaro", "barberly",
  "ringmybarber", "goldie", "glossgenius", "styleseat", "fresha",
  "mangomint", "boulevard", "simplybook",
]);

const LIVE_PLATFORMS = new Set<PlatformId>([
  ...OAUTH_PLATFORMS, ...APIKEY_PLATFORMS, ...RELAY_PLATFORMS,
]);

function platformToDbKey(id: PlatformId): string {
  if (id === "google") return "google_calendar";
  if (id === "outlook") return "outlook_calendar";
  return id;
}

function Platforms() {
  const search = useSearch({ from: "/platforms" });
  const qc = useQueryClient();
  const getGoogleAuthUrl = useServerFn(createGoogleAuthUrl);
  const getSquareAuthUrl = useServerFn(createSquareAuthUrl);
  const getCalendlyAuthUrl = useServerFn(createCalendlyAuthUrl);
  const getAcuityAuthUrl = useServerFn(createAcuityAuthUrl);
  const getZohoAuthUrl = useServerFn(createZohoAuthUrl);
  const getOutlookAuthUrl = useServerFn(createOutlookAuthUrl);
  const connectCliniko = useServerFn(connectClinikoApiKey);
  const connectZenoti = useServerFn(connectZenotiApiKey);
  const list = useServerFn(listConnections);
  const disconnect = useServerFn(disconnectPlatform);
  const link = useServerFn(linkPlatform);
  const connectIcal = useServerFn(connectIcalFeed);
  const disconnectIcal = useServerFn(disconnectIcalFeed);
  const listIcal = useServerFn(listIcalFeeds);
  const refreshIcal = useServerFn(refreshIcalFeed);

  // Which API key dialog is open
  const [apiKeyDialog, setApiKeyDialog] = useState<"cliniko" | "zenoti" | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Which relay-link dialog is open
  const [linkDialogPlatform, setLinkDialogPlatform] = useState<PlatformId | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

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
    if (search.outlook === "connected") {
      toast.success("Outlook Calendar connected");
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
    } else if (search.outlook === "error") {
      toast.error(
        `Outlook Calendar connection failed${search.reason ? `: ${search.reason}` : ""}`,
      );
    }
  }, [search.outlook, search.reason, qc]);

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

  const { data: icalData } = useQuery({
    queryKey: ["ical-feeds"],
    queryFn: () => listIcal(),
  });
  const icalByPlatform = new Map(
    (icalData?.feeds ?? []).map((f) => [f.platform as string, f]),
  );

  const connectedSet = new Set(
    (realConnections?.connections ?? []).map((c) => c.platform),
  );
  const accountLabelFor = (dbKey: string) =>
    realConnections?.connections.find((c) => c.platform === dbKey)?.account_email;
  const hasGoogleOrOutlookConnected =
    connectedSet.has("google_calendar") || connectedSet.has("outlook_calendar");


  // Google connect
  const connectGoogle = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getGoogleAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Outlook connect
  const connectOutlook = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getOutlookAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Zoho connect
  const connectZoho = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getZohoAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Acuity connect
  const connectAcuity = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getAcuityAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Calendly connect
  const connectCalendly = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first");
      const { url } = await getCalendlyAuthUrl({ data: {} });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Square connect
  const connectSquare = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
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

  // Handle API key connect submission
  const handleApiKeyConnect = async (
    platform: "cliniko" | "zenoti",
    values: Record<string, string>,
  ) => {
    setApiKeyLoading(true);
    try {
      if (platform === "cliniko") {
        const result = await connectCliniko({ data: { apiKey: values.apiKey } });
        toast.success(`Cliniko connected · ${result.accountLabel}`);
      } else {
        const result = await connectZenoti({ data: { apiKey: values.apiKey } });
        toast.success(`Zenoti connected · ${result.accountLabel}`);
      }
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
      setApiKeyDialog(null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Connection failed");
    } finally {
      setApiKeyLoading(false);
    }
  };

  const action = (id: PlatformId) => {
    const dbKey = platformToDbKey(id);

    if (id === "google") {
      connectedSet.has(dbKey) ? disconnectPlatformMut.mutate(dbKey) : connectGoogle.mutate();
      return;
    }
    if (id === "outlook") {
      connectedSet.has(dbKey) ? disconnectPlatformMut.mutate(dbKey) : connectOutlook.mutate();
      return;
    }
    if (id === "square") {
      connectedSet.has(dbKey) ? disconnectPlatformMut.mutate(dbKey) : connectSquare.mutate();
      return;
    }
    if (id === "calendly") {
      connectedSet.has(dbKey) ? disconnectPlatformMut.mutate(dbKey) : connectCalendly.mutate();
      return;
    }
    if (id === "acuity") {
      connectedSet.has(dbKey) ? disconnectPlatformMut.mutate(dbKey) : connectAcuity.mutate();
      return;
    }
    if (id === "zoho") {
      connectedSet.has(dbKey) ? disconnectPlatformMut.mutate(dbKey) : connectZoho.mutate();
      return;
    }
    if (id === "cliniko") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        setApiKeyDialog("cliniko");
      }
      return;
    }
    if (id === "zenoti") {
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else {
        setApiKeyDialog("zenoti");
      }
      return;
    }

    if (RELAY_PLATFORMS.has(id)) {
      const hasIcal = icalByPlatform.has(id);
      if (hasIcal) {
        // iCal connected — clicking the action disconnects the feed.
        disconnectIcalMut.mutate(id);
        return;
      }
      if (connectedSet.has(dbKey)) {
        disconnectPlatformMut.mutate(dbKey);
      } else if (supportsIcal(id)) {
        // Open the dialog so the user can pick iCal or relay.
        setLinkDialogPlatform(id);
      } else if (!hasGoogleOrOutlookConnected) {
        toast.error("Connect Google or Outlook Calendar first.");
      } else {
        setLinkDialogPlatform(id);
      }
      return;
    }

    toast("Connector coming soon.");
  };

  const isActionPending = (id: PlatformId) => {
    if (id === "google") return connectGoogle.isPending || disconnectPlatformMut.isPending;
    if (id === "outlook") return connectOutlook.isPending || disconnectPlatformMut.isPending;
    if (id === "square") return connectSquare.isPending || disconnectPlatformMut.isPending;
    if (id === "calendly") return connectCalendly.isPending || disconnectPlatformMut.isPending;
    if (id === "acuity") return connectAcuity.isPending || disconnectPlatformMut.isPending;
    if (id === "zoho") return connectZoho.isPending || disconnectPlatformMut.isPending;
    if (id === "cliniko" || id === "zenoti") return apiKeyLoading || disconnectPlatformMut.isPending;
    if (RELAY_PLATFORMS.has(id))
      return linkLoading || disconnectPlatformMut.isPending || disconnectIcalMut.isPending;
    return false;
  };

  const disconnectIcalMut = useMutation({
    mutationFn: async (platformId: PlatformId) => {
      await disconnectIcal({ data: { platform: platformId as never } });
    },
    onSuccess: () => {
      toast.success("iCal feed disconnected");
      qc.invalidateQueries({ queryKey: ["ical-feeds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshIcalMut = useMutation({
    mutationFn: async (platformId: PlatformId) => {
      return refreshIcal({ data: { platform: platformId as never } });
    },
    onSuccess: (r) => {
      toast.success(`Synced — ${r.synced} bookings`);
      qc.invalidateQueries({ queryKey: ["ical-feeds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLinkConnect = async (handle: string) => {
    if (!linkDialogPlatform) return;
    setLinkLoading(true);
    try {
      await link({ data: { platform: linkDialogPlatform as never, handle } });
      toast.success(`${PLATFORMS[linkDialogPlatform].label} linked`);
      qc.invalidateQueries({ queryKey: ["platform-connections"] });
      setLinkDialogPlatform(null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Linking failed");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleIcalConnect = async (feedUrl: string) => {
    if (!linkDialogPlatform) return;
    setLinkLoading(true);
    try {
      const r = await connectIcal({
        data: { platform: linkDialogPlatform as never, feedUrl },
      });
      toast.success(`${PLATFORMS[linkDialogPlatform].label} connected — ${r.synced} bookings`);
      qc.invalidateQueries({ queryKey: ["ical-feeds"] });
      setLinkDialogPlatform(null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "iCal connection failed");
    } finally {
      setLinkLoading(false);
    }
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
                const ical = icalByPlatform.get(id);
                const hasIcal = !!ical;
                const isConnected = connectedSet.has(dbKey) || hasIcal;
                const label = connectedSet.has(dbKey) ? accountLabelFor(dbKey) : undefined;
                const isLive = LIVE_PLATFORMS.has(id);

                let subline: string;
                if (hasIcal) {
                  if (ical!.lastError && (ical!.consecutiveFailures ?? 0) >= 3) {
                    subline = `iCal sync failing — ${ical!.lastError}`;
                  } else if (ical!.lastSyncedAt) {
                    const mins = Math.max(
                      0,
                      Math.round((Date.now() - Date.parse(ical!.lastSyncedAt)) / 60000),
                    );
                    subline = `Synced via iCal · ${mins} min ago`;
                  } else {
                    subline = "Connected via iCal";
                  }
                } else if (isConnected) {
                  subline = `Connected${label ? ` · ${label}` : ""}`;
                } else if (isLive) {
                  subline = "Not connected";
                } else {
                  subline = "Coming soon";
                }

                const tier = PLATFORM_TIER[id];
                const hasGoogleOrOutlook =
                  connectedSet.has("google_calendar") || connectedSet.has("outlook_calendar");
                const tierNeedsRelayWarning =
                  tier === "relay_only" && !hasGoogleOrOutlook && !hasIcal && !supportsIcal(id);

                const showBadge = tier !== "direct_full";
                const icalBadge = hasIcal ? "Direct (iCal)" : null;

                return (
                  <li
                    key={id}
                    className="flex flex-col gap-2 rounded-md border border-l-4 bg-card p-4"
                    style={{ borderLeftColor: p.colorVar }}
                  >
                    <div className="flex items-center gap-3">
                      <PlatformLogo platform={id} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {p.label}
                          </span>
                          {icalBadge ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              {icalBadge}
                            </span>
                          ) : (
                            showBadge && (
                              <span
                                title={tierNote(id)}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                {tierShortLabel(id)}
                              </span>
                            )
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {subline}
                        </div>
                      </div>
                      {hasIcal && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => refreshIcalMut.mutate(id)}
                          disabled={refreshIcalMut.isPending}
                        >
                          Sync
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={isConnected ? "outline" : isLive ? "default" : "ghost"}
                        onClick={() => action(id)}
                        disabled={!isLive || isActionPending(id)}
                        className={cn(!isLive && "cursor-not-allowed opacity-50")}
                      >
                        {isConnected ? "Disconnect" : isLive ? "Connect" : "Soon"}
                      </Button>
                    </div>


                    {tierNeedsRelayWarning && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                          <span>
                            Bookings from {p.label} can only reach Jey Link through Google or Outlook Calendar. Connect one to start syncing.
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => connectGoogle.mutate()}
                            disabled={connectGoogle.isPending}
                          >
                            Connect Google
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => connectOutlook.mutate()}
                            disabled={connectOutlook.isPending}
                          >
                            Connect Outlook
                          </Button>
                        </div>
                      </div>
                    )}

                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Cliniko API key dialog */}
      <ApiKeyConnectDialog
        open={apiKeyDialog === "cliniko"}
        onOpenChange={(open) => !open && setApiKeyDialog(null)}
        platformName="Cliniko"
        fields={[
          {
            key: "apiKey",
            label: "API Key",
            placeholder: "Paste your Cliniko API key here",
            helpText: "Found in Cliniko → My Info → Manage API Keys",
          },
        ]}
        onConnect={(values) => handleApiKeyConnect("cliniko", values)}
        isLoading={apiKeyLoading}
        helpUrl="https://help.cliniko.com/en/articles/2776-api-keys"
      />

      {/* Zenoti API key dialog */}
      <ApiKeyConnectDialog
        open={apiKeyDialog === "zenoti"}
        onOpenChange={(open) => !open && setApiKeyDialog(null)}
        platformName="Zenoti"
        fields={[
          {
            key: "apiKey",
            label: "API Key",
            placeholder: "Paste your Zenoti API key here",
            helpText: "Found in Zenoti → Admin → Setup → Apps → Generate API Key",
          },
        ]}
        onConnect={(values) => handleApiKeyConnect("zenoti", values)}
        isLoading={apiKeyLoading}
        helpUrl="https://docs.zenoti.com/docs/authentication"
      />

      {/* Relay-platform link dialog */}
      <LinkPlatformDialog
        open={linkDialogPlatform !== null}
        onOpenChange={(open) => !open && setLinkDialogPlatform(null)}
        platform={linkDialogPlatform}
        onConnect={handleLinkConnect}
        onConnectIcal={handleIcalConnect}
        hasRelayCalendar={hasGoogleOrOutlookConnected}
        isLoading={linkLoading}
      />

    </main>
  );
}
