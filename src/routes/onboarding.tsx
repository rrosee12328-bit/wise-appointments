import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  Plug,
  RefreshCw,
  TestTube2,
} from "lucide-react";
import { toast } from "sonner";
import { ApiKeyConnectDialog } from "@/components/ApiKeyConnectDialog";
import { LinkPlatformDialog } from "@/components/LinkPlatformDialog";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pushAppointmentBlock, syncAppointmentBlocks } from "@/lib/appointment-writeback.functions";
import { getAppointments, upsertAppointment } from "@/lib/appointments.functions";
import { createAcuityAuthUrl } from "@/lib/acuity-oauth.functions";
import { syncAcuityAppointments } from "@/lib/acuity-sync.functions";
import { createCalendlyAuthUrl } from "@/lib/calendly-oauth.functions";
import { syncCalendlyEvents } from "@/lib/calendly-sync.functions";
import { connectClinikoApiKey } from "@/lib/cliniko-apikey.functions";
import { createGoogleAuthUrl, listConnections } from "@/lib/google-oauth.functions";
import { syncGoogleCalendar } from "@/lib/google-sync.functions";
import { connectIcalFeed, listIcalFeeds, refreshIcalFeed } from "@/lib/ical-feed.functions";
import { createOutlookAuthUrl } from "@/lib/outlook-oauth.functions";
import { syncOutlookCalendar } from "@/lib/outlook-sync.functions";
import { linkPlatform } from "@/lib/platform-link.functions";
import { PLATFORMS, supportsIcal, type PlatformId } from "@/lib/platforms";
import { createSquareAuthUrl } from "@/lib/square-oauth.functions";
import { syncSquareBookings } from "@/lib/square-sync.functions";
import { connectZenotiApiKey } from "@/lib/zenoti-apikey.functions";
import { createZohoAuthUrl } from "@/lib/zoho-oauth.functions";
import { syncZohoBookings } from "@/lib/zoho-sync.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
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
      { title: "Setup — Jey Link" },
      {
        name: "description",
        content: "Connect your calendars and booking apps in the right order.",
      },
    ],
  }),
  component: Onboarding,
});

const RETURN_TO = "/onboarding";
const MAIN_CALENDARS: PlatformId[] = ["google", "outlook"];
const BOOKING_APPS: PlatformId[] = [
  "square",
  "booksy",
  "thecut",
  "glossgenius",
  "calendly",
  "acuity",
  "setmore",
  "vagaro",
  "fresha",
  "zoho",
  "cliniko",
  "zenoti",
];
const OAUTH_APPS = new Set<PlatformId>(["square", "calendly", "acuity", "zoho"]);
const API_KEY_APPS = new Set<PlatformId>(["cliniko", "zenoti"]);

const GUIDE_STEPS: Partial<Record<PlatformId, string[]>> = {
  square: [
    "Open Square Appointments and go to Calendar & Booking settings.",
    "Choose Calendar Sync, then connect or enable Google Calendar.",
    "Confirm new Square appointments are added to the same Google calendar connected here.",
  ],
  booksy: [
    "Open Booksy Biz and go to Settings, then Calendar.",
    "Turn on Google Calendar sync or copy the iCal feed if your account offers one.",
    "Booksy bookings should appear on Google first, then Jey Link will pull them in.",
  ],
  thecut: [
    "Open TheCut and go to account or calendar settings.",
    "Enable sync to Google Calendar for appointments.",
    "After TheCut writes to Google, run sync in Jey Link to pull those blocks in.",
  ],
  glossgenius: [
    "Open GlossGenius settings and find Calendar Sync.",
    "Connect Google Calendar and allow appointment events to be shared.",
    "Use the same Google account you connected to Jey Link.",
  ],
  calendly: [
    "Open Calendly and go to Calendar Sync.",
    "Connect Google Calendar as the calendar Calendly checks for conflicts.",
    "Make sure Calendly adds busy events or respects busy time on that calendar.",
  ],
  acuity: [
    "Open Acuity and go to Sync with other calendars.",
    "Connect Google Calendar and choose the calendar Acuity should write bookings to.",
    "After Acuity writes events to Google, Jey Link can block that time everywhere.",
  ],
  setmore: [
    "Open Setmore and go to Integrations, then Google Calendar.",
    "Connect the same Google account used in Jey Link.",
    "Enable appointment export/sync so new bookings show as busy time.",
  ],
  vagaro: [
    "Open Vagaro and go to Settings, then Calendar Sync.",
    "Turn on Google Calendar sync or copy the iCal subscription link.",
    "Run the first sync here after Vagaro appointments appear on Google.",
  ],
  fresha: [
    "Open Fresha partner settings and go to Calendar Sync.",
    "Connect Google Calendar or copy the iCal feed URL.",
    "Confirm bookings appear on your calendar before relying on the blocks.",
  ],
  zoho: [
    "Open Zoho Bookings and go to Integrations, then Calendars.",
    "Connect Google Calendar and enable availability/conflict checking.",
    "Use Jey Link sync once Zoho events are visible on Google.",
  ],
};

function platformToDbKey(id: PlatformId): string {
  if (id === "google") return "google_calendar";
  if (id === "outlook") return "outlook_calendar";
  return id;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusToast(platform: string, status: string | undefined, reason: string | undefined) {
  if (status === "connected") toast.success(`${platform} connected`);
  if (status === "error")
    toast.error(`${platform} connection failed${reason ? `: ${reason}` : ""}`);
}

function readLocalFlag(key: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "true";
}

function Onboarding() {
  const search = useSearch({ from: "/onboarding" });
  const qc = useQueryClient();
  const list = useServerFn(listConnections);
  const listIcal = useServerFn(listIcalFeeds);
  const connectIcal = useServerFn(connectIcalFeed);
  const link = useServerFn(linkPlatform);
  const getGoogleAuthUrl = useServerFn(createGoogleAuthUrl);
  const getOutlookAuthUrl = useServerFn(createOutlookAuthUrl);
  const getSquareAuthUrl = useServerFn(createSquareAuthUrl);
  const getCalendlyAuthUrl = useServerFn(createCalendlyAuthUrl);
  const getAcuityAuthUrl = useServerFn(createAcuityAuthUrl);
  const getZohoAuthUrl = useServerFn(createZohoAuthUrl);
  const connectCliniko = useServerFn(connectClinikoApiKey);
  const connectZenoti = useServerFn(connectZenotiApiKey);
  const syncGoogle = useServerFn(syncGoogleCalendar);
  const syncOutlook = useServerFn(syncOutlookCalendar);
  const syncSquare = useServerFn(syncSquareBookings);
  const syncCalendly = useServerFn(syncCalendlyEvents);
  const syncAcuity = useServerFn(syncAcuityAppointments);
  const syncZoho = useServerFn(syncZohoBookings);
  const syncBlocks = useServerFn(syncAppointmentBlocks);
  const refreshFeed = useServerFn(refreshIcalFeed);
  const fetchAppts = useServerFn(getAppointments);
  const upsertFn = useServerFn(upsertAppointment);
  const pushBlockFn = useServerFn(pushAppointmentBlock);

  const [selectedGuide, setSelectedGuide] = useState<PlatformId>("square");
  const [guideConfirmed, setGuideConfirmed] = useState(() =>
    readLocalFlag("jeylink:onboarding:guide-confirmed"),
  );
  const [autoSyncStarted, setAutoSyncStarted] = useState(() =>
    readLocalFlag("jeylink:onboarding:auto-sync-started"),
  );
  const [linkDialogPlatform, setLinkDialogPlatform] = useState<PlatformId | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [apiKeyDialog, setApiKeyDialog] = useState<"cliniko" | "zenoti" | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [firstSyncMessage, setFirstSyncMessage] = useState<string | null>(null);

  const { data: realConnections } = useQuery({
    queryKey: ["platform-connections"],
    queryFn: () => list(),
  });
  const { data: icalData } = useQuery({
    queryKey: ["ical-feeds"],
    queryFn: () => listIcal(),
  });
  const { data: appts } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => fetchAppts(),
    refetchInterval: firstSyncMessage === "Syncing..." ? 2000 : false,
  });

  const icalByPlatform = new Map<string, NonNullable<typeof icalData>["feeds"][number]>(
    (icalData?.feeds ?? []).map((feed) => [feed.platform, feed]),
  );
  const connectedSet = new Set((realConnections?.connections ?? []).map((conn) => conn.platform));
  const hasMainCalendar =
    connectedSet.has("google_calendar") || connectedSet.has("outlook_calendar");
  const connectedBookingApps = (realConnections?.connections ?? [])
    .map((conn) => conn.platform)
    .filter(
      (platform) => !["google_calendar", "outlook_calendar", "acuity_pending"].includes(platform),
    );
  const hasBookingApp = connectedBookingApps.length > 0 || (icalData?.feeds ?? []).length > 0;
  const recentAppointments = useMemo(
    () =>
      [...(appts?.items ?? [])]
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        .slice(0, 5),
    [appts?.items],
  );
  const hasAppointments = (appts?.items ?? []).length > 0;
  const hasTestBlock = (appts?.items ?? []).some(
    (appt) => appt.is_block && appt.client_name === "Jey Link Test Block",
  );
  const steps = [
    { label: "Welcome", done: true },
    { label: "Main calendar", done: hasMainCalendar },
    { label: "Booking app", done: hasBookingApp },
    { label: "Booking-app sync", done: guideConfirmed },
    {
      label: "First sync",
      done: hasAppointments || Boolean(firstSyncMessage?.startsWith("Synced")),
    },
    { label: "Test it", done: hasTestBlock },
    { label: "Done", done: hasMainCalendar && hasBookingApp && guideConfirmed && hasTestBlock },
  ];

  useEffect(() => {
    statusToast("Google Calendar", search.google, search.reason);
  }, [search.google, search.reason]);
  useEffect(() => {
    statusToast("Outlook Calendar", search.outlook, search.reason);
  }, [search.outlook, search.reason]);
  useEffect(() => {
    statusToast("Square", search.square, search.reason);
  }, [search.square, search.reason]);
  useEffect(() => {
    statusToast("Calendly", search.calendly, search.reason);
  }, [search.calendly, search.reason]);
  useEffect(() => {
    statusToast("Acuity", search.acuity, search.reason);
  }, [search.acuity, search.reason]);
  useEffect(() => {
    statusToast("Zoho", search.zoho, search.reason);
  }, [search.zoho, search.reason]);

  const invalidateSetup = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["platform-connections"] }),
      qc.invalidateQueries({ queryKey: ["ical-feeds"] }),
      qc.invalidateQueries({ queryKey: ["appointments"] }),
    ]);

  const startOAuth = async (id: PlatformId) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in first");
    const input = { returnTo: RETURN_TO };
    let url: string;
    if (id === "google") url = (await getGoogleAuthUrl({ data: input })).url;
    else if (id === "outlook") url = (await getOutlookAuthUrl({ data: input })).url;
    else if (id === "square") url = (await getSquareAuthUrl({ data: input })).url;
    else if (id === "calendly") url = (await getCalendlyAuthUrl({ data: input })).url;
    else if (id === "acuity") url = (await getAcuityAuthUrl({ data: input })).url;
    else if (id === "zoho") url = (await getZohoAuthUrl({ data: input })).url;
    else throw new Error("OAuth is not available for this platform yet");
    window.location.href = url;
  };

  const connectPlatform = useMutation({
    mutationFn: async (id: PlatformId) => {
      if (id === "google" || id === "outlook" || OAUTH_APPS.has(id)) {
        await startOAuth(id);
        return;
      }
      if (API_KEY_APPS.has(id)) {
        setApiKeyDialog(id as "cliniko" | "zenoti");
        return;
      }
      if (!hasMainCalendar && !supportsIcal(id)) {
        throw new Error(
          "Connect Google or Outlook first, then turn on sync inside this booking app.",
        );
      }
      setLinkDialogPlatform(id);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runFirstSync = useMutation({
    mutationFn: async () => {
      setFirstSyncMessage("Syncing...");
      const icalPromise = listIcal()
        .then(({ feeds }) =>
          Promise.allSettled(
            feeds.map((feed) => refreshFeed({ data: { platform: feed.platform as never } })),
          ),
        )
        .catch(() => []);
      const results = await Promise.allSettled([
        syncGoogle(),
        syncOutlook(),
        syncSquare(),
        syncCalendly(),
        syncAcuity(),
        syncZoho(),
      ]);
      const icalResults = await icalPromise;
      const blockResult = await syncBlocks();
      const synced = results.reduce((count, result) => {
        if (result.status !== "fulfilled") return count;
        return count + ((result.value as { synced?: number }).synced ?? 0);
      }, 0);
      const iCalSynced = Array.isArray(icalResults)
        ? icalResults.reduce((count, result) => {
            if (result.status !== "fulfilled") return count;
            return count + ((result.value as { synced?: number }).synced ?? 0);
          }, 0)
        : 0;
      await invalidateSetup();
      return {
        synced: synced + iCalSynced,
        blocks: blockResult.googleUpdated + blockResult.outlookUpdated,
      };
    },
    onSuccess: ({ synced, blocks }) => {
      const message = `Synced ${synced} appointment${synced === 1 ? "" : "s"} · ${blocks} calendar block${blocks === 1 ? "" : "s"} updated`;
      setFirstSyncMessage(message);
      toast.success("First sync complete", { description: message });
    },
    onError: (err: Error) => {
      setFirstSyncMessage(err.message);
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (hasMainCalendar && hasBookingApp && guideConfirmed && !autoSyncStarted) {
      setAutoSyncStarted(true);
      localStorage.setItem("jeylink:onboarding:auto-sync-started", "true");
      runFirstSync.mutate();
    }
  }, [autoSyncStarted, guideConfirmed, hasBookingApp, hasMainCalendar, runFirstSync]);

  const createTestBlock = useMutation({
    mutationFn: async () => {
      const start = new Date(Date.now() + 30 * 60_000);
      start.setSeconds(0, 0);
      const end = new Date(start.getTime() + 15 * 60_000);
      const created = await upsertFn({
        data: {
          source_platform: "walk_in",
          client_name: "Jey Link Test Block",
          service: "Connection test",
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          is_block: true,
          note: "Created from onboarding to confirm calendar writeback.",
        },
      });
      await pushBlockFn({ data: { id: (created as { id: string }).id } });
    },
    onSuccess: async () => {
      await invalidateSetup();
      toast.success("Test block created", {
        description: "Check Google or Outlook Calendar for the Jey Link Test Block.",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleApiKeyConnect = async (
    platform: "cliniko" | "zenoti",
    values: Record<string, string>,
  ) => {
    setApiKeyLoading(true);
    try {
      if (platform === "cliniko") {
        await connectCliniko({ data: { apiKey: values.apiKey } });
      } else {
        await connectZenoti({ data: { apiKey: values.apiKey } });
      }
      await invalidateSetup();
      setApiKeyDialog(null);
      toast.success(`${PLATFORMS[platform].label} connected`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleLinkConnect = async (handle: string) => {
    if (!linkDialogPlatform) return;
    setLinkLoading(true);
    try {
      await link({ data: { platform: linkDialogPlatform as never, handle } });
      await invalidateSetup();
      setLinkDialogPlatform(null);
      toast.success(`${PLATFORMS[linkDialogPlatform].label} linked`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleIcalConnect = async (feedUrl: string) => {
    if (!linkDialogPlatform) return;
    setLinkLoading(true);
    try {
      const result = await connectIcal({
        data: { platform: linkDialogPlatform as never, feedUrl },
      });
      await invalidateSetup();
      setLinkDialogPlatform(null);
      toast.success(`${PLATFORMS[linkDialogPlatform].label} connected`, {
        description: `${result.synced} booking${result.synced === 1 ? "" : "s"} imported`,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLinkLoading(false);
    }
  };

  const confirmGuide = () => {
    setGuideConfirmed(true);
    localStorage.setItem("jeylink:onboarding:guide-confirmed", "true");
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Jey Link setup</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Connect your scheduler</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Jey Link connects all your booking apps into one calendar so you never get double-booked.
        </p>
      </header>

      <div className="mb-5 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={cn(
              "rounded-lg border p-2 text-xs",
              step.done ? "border-accent/40 bg-accent/10" : "bg-card",
            )}
          >
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              {step.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              {index + 1}. {step.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border bg-card p-4">
            <StepHeader step="1" title="Welcome" done />
            <p className="mt-2 text-sm text-muted-foreground">
              Start with the calendar you actually trust day to day. Jey Link uses that as the hub,
              then pulls bookings in and writes busy blocks back out.
            </p>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <StepHeader step="2" title="Connect your main calendar" done={hasMainCalendar} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {MAIN_CALENDARS.map((id) => {
                const connected = connectedSet.has(platformToDbKey(id));
                return (
                  <Button
                    key={id}
                    size="lg"
                    variant={connected ? "outline" : "default"}
                    className="h-14 justify-start"
                    onClick={() => connectPlatform.mutate(id)}
                    disabled={connectPlatform.isPending}
                  >
                    <PlatformLogo platform={id} size={28} />
                    {connected
                      ? `${PLATFORMS[id].label} connected`
                      : `Connect ${PLATFORMS[id].label}`}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <StepHeader step="3" title="Connect your booking app" done={hasBookingApp} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {BOOKING_APPS.map((id) => {
                const dbKey = platformToDbKey(id);
                const connected = connectedSet.has(dbKey) || icalByPlatform.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => connectPlatform.mutate(id)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50",
                      connected && "border-accent/40 bg-accent/10",
                    )}
                  >
                    <PlatformLogo platform={id} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {PLATFORMS[id].label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {connected
                          ? "Connected"
                          : supportsIcal(id)
                            ? "Connect or add iCal"
                            : "Connect"}
                      </span>
                    </span>
                    {connected ? (
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                    ) : (
                      <Plug className="h-4 w-4" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <StepHeader
              step="4"
              title="Turn on Google Calendar sync inside your booking app"
              done={guideConfirmed}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(GUIDE_STEPS).map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant={selectedGuide === id ? "default" : "outline"}
                  onClick={() => setSelectedGuide(id as PlatformId)}
                >
                  {PLATFORMS[id as PlatformId].label}
                </Button>
              ))}
            </div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              {(GUIDE_STEPS[selectedGuide] ?? []).map((step) => (
                <li key={step} className="rounded-md bg-muted/40 px-3 py-2">
                  {step}
                </li>
              ))}
            </ol>
            <Button
              className="mt-3"
              variant={guideConfirmed ? "outline" : "default"}
              onClick={confirmGuide}
            >
              {guideConfirmed ? "Booking-app sync step marked done" : "I turned this on"}
            </Button>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <StepHeader step="5" title="First sync" done={hasAppointments} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => runFirstSync.mutate()}
                disabled={runFirstSync.isPending || !hasMainCalendar}
              >
                <RefreshCw className={cn("h-4 w-4", runFirstSync.isPending && "animate-spin")} />
                {runFirstSync.isPending ? "Syncing..." : "Run first sync"}
              </Button>
              {firstSyncMessage ? (
                <Badge variant={firstSyncMessage === "Syncing..." ? "outline" : "secondary"}>
                  {firstSyncMessage}
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 rounded-md border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Appointments populating
              </div>
              {recentAppointments.length ? (
                <div className="space-y-2">
                  {recentAppointments.map((appt) => (
                    <div key={appt.id} className="text-sm">
                      <div className="font-medium text-foreground">{appt.client_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {appt.source_platform} · {formatTime(appt.starts_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No appointments imported yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <StepHeader step="6" title="Test it" done={hasTestBlock} />
            <p className="mt-2 text-sm text-muted-foreground">
              Create a 15-minute Jey Link test block, then open your main calendar and confirm it
              shows up as busy time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => createTestBlock.mutate()}
                disabled={createTestBlock.isPending || !hasMainCalendar}
              >
                <TestTube2 className="h-4 w-4" />
                {hasTestBlock ? "Create another test block" : "Create test block"}
              </Button>
              <Button asChild variant="outline">
                <a
                  href="https://calendar.google.com/calendar/u/0/r"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Calendar
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <StepHeader step="7" title="Done" done={steps.at(-1)?.done ?? false} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ChecklistItem label="Main calendar connected" done={hasMainCalendar} />
              <ChecklistItem label="Booking app connected" done={hasBookingApp} />
              <ChecklistItem label="Booking-app calendar sync enabled" done={guideConfirmed} />
              <ChecklistItem label="Test block confirmed" done={hasTestBlock} />
            </div>
            <Button asChild className="mt-3">
              <Link to="/" search={{ verify: undefined }}>
                Go to schedule
              </Link>
            </Button>
          </section>
        </div>

        <aside className="h-fit rounded-lg border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarCheck className="h-4 w-4 text-accent" />
            Connection checklist
          </h2>
          <div className="mt-3 space-y-2">
            {steps.map((step) => (
              <ChecklistItem key={step.label} label={step.label} done={step.done} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            The key loop is booking app to Google/Outlook, then Google/Outlook to Jey Link. Once
            both sides are connected, busy blocks can protect the schedule everywhere.
          </p>
        </aside>
      </div>

      <ApiKeyConnectDialog
        open={apiKeyDialog === "cliniko"}
        onOpenChange={(open) => !open && setApiKeyDialog(null)}
        platformName="Cliniko"
        fields={[
          {
            key: "apiKey",
            label: "API Key",
            placeholder: "Paste your Cliniko API key here",
            helpText: "Found in Cliniko -> My Info -> Manage API Keys",
          },
        ]}
        onConnect={(values) => handleApiKeyConnect("cliniko", values)}
        isLoading={apiKeyLoading}
        helpUrl="https://help.cliniko.com/en/articles/2776-api-keys"
      />
      <ApiKeyConnectDialog
        open={apiKeyDialog === "zenoti"}
        onOpenChange={(open) => !open && setApiKeyDialog(null)}
        platformName="Zenoti"
        fields={[
          {
            key: "apiKey",
            label: "API Key",
            placeholder: "Paste your Zenoti API key here",
            helpText: "Found in Zenoti -> Admin -> Setup -> Apps -> Generate API Key",
          },
        ]}
        onConnect={(values) => handleApiKeyConnect("zenoti", values)}
        isLoading={apiKeyLoading}
        helpUrl="https://docs.zenoti.com/docs/authentication"
      />
      <LinkPlatformDialog
        open={linkDialogPlatform !== null}
        onOpenChange={(open) => !open && setLinkDialogPlatform(null)}
        platform={linkDialogPlatform}
        onConnect={handleLinkConnect}
        onConnectIcal={handleIcalConnect}
        hasRelayCalendar={hasMainCalendar}
        isLoading={linkLoading}
      />
    </main>
  );
}

function StepHeader({ step, title, done }: { step: string; title: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-foreground">
        Step {step} - {title}
      </h2>
      <Badge variant={done ? "secondary" : "outline"}>{done ? "Done" : "Next"}</Badge>
    </div>
  );
}

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-accent" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
