import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Mail,
  Calendar,
  Eye,
  EyeOff,
  Search,
  List,
  CalendarDays,
  CalendarRange,
  CalendarCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentRow } from "@/components/AppointmentCard";
import { PlatformBadge } from "@/components/PlatformBadge";
import { ConflictResolverDialog } from "@/components/ConflictResolverDialog";
import { WalkInDialog } from "@/components/WalkInDialog";
import { AppointmentDetailDialog } from "@/components/AppointmentDetailDialog";
import { DayTimelineView, MonthGridView, WeekView } from "@/components/CalendarViews";

import { useAuth } from "@/hooks/use-auth";
import { useAutoSyncPlatforms } from "@/hooks/use-auto-sync-platforms";
import { useBillingStatus } from "@/hooks/use-billing-status";
import {
  type Appointment,
  findConflicts,
  formatRelativeDay,
  formatTime,
  toUiAppointment,
} from "@/lib/mock-data";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { getAppointments, upsertAppointment } from "@/lib/appointments.functions";
import {
  rescheduleAppointment,
  pushAppointmentBlock,
  syncAppointmentBlocks,
} from "@/lib/appointment-writeback.functions";
import { getProfile } from "@/lib/profile.functions";
import { syncGoogleCalendar } from "@/lib/google-sync.functions";
import { syncOutlookCalendar } from "@/lib/outlook-sync.functions";
import { syncSquareBookings } from "@/lib/square-sync.functions";
import { syncCalendlyEvents } from "@/lib/calendly-sync.functions";
import { syncAcuityAppointments } from "@/lib/acuity-sync.functions";
import { syncZohoBookings } from "@/lib/zoho-sync.functions";
import { listIcalFeeds, refreshIcalFeed } from "@/lib/ical-feed.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => ({
    verify: typeof s.verify === "string" ? (s.verify as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Schedule — Jey Link" },
      {
        name: "description",
        content: "Your next appointment and today's schedule, all in one place.",
      },
      { property: "og:title", content: "Schedule — Jey Link" },
      {
        property: "og:description",
        content: "Your next appointment, today's timeline, and platform sync status.",
      },
    ],
  }),
  component: Schedule,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
/** True when the appointment overlaps today's local-day window — covers
 *  events that started yesterday and run into today, events that start
 *  today, and events that start today and end tomorrow. The home schedule
 *  needs all of these, not just events whose start_at is today. */
function overlapsToday(start: Date, durationMin: number) {
  const end = new Date(start.getTime() + durationMin * 60_000);
  return end > startOfToday() && start <= endOfToday();
}

function groupByDay(appts: Appointment[]) {
  const map = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = formatRelativeDay(a.start);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return Array.from(map.entries());
}

function sourcePlatformFor(appt: Appointment, isNew: boolean) {
  if (isNew) return "walk_in";
  if (appt.sourcePlatform) return appt.sourcePlatform;
  if (appt.platform === "google") return "google_calendar";
  if (appt.platform === "outlook") return "outlook_calendar";
  return appt.platform;
}

function Schedule() {
  const search = useSearch({ from: "/" });
  const { session } = useAuth();
  const qc = useQueryClient();
  const fetchAppts = useServerFn(getAppointments);
  const upsertFn = useServerFn(upsertAppointment);
  const rescheduleFn = useServerFn(rescheduleAppointment);
  const pushBlockFn = useServerFn(pushAppointmentBlock);
  const syncBlocks = useServerFn(syncAppointmentBlocks);
  const fetchProfile = useServerFn(getProfile);
  const syncGoogle = useServerFn(syncGoogleCalendar);
  const syncOutlook = useServerFn(syncOutlookCalendar);
  const syncSquare = useServerFn(syncSquareBookings);
  const syncCalendly = useServerFn(syncCalendlyEvents);
  const syncAcuity = useServerFn(syncAcuityAppointments);
  const syncZoho = useServerFn(syncZohoBookings);
  const listFeeds = useServerFn(listIcalFeeds);
  const refreshFeed = useServerFn(refreshIcalFeed);
  const { data: billing } = useBillingStatus(!!session);

  useAutoSyncPlatforms(!!session && Boolean(billing?.hasPaidAccess));

  const { data, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => fetchAppts(),
    enabled: !!session,
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: false,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    enabled: !!session,
  });

  const allAppointments: Appointment[] = useMemo(
    () => (data?.items ?? []).map(toUiAppointment),
    [data],
  );

  const [q, setQ] = useState("");
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<PlatformId>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [resolverOpen, setResolverOpen] = useState(false);
  const [appointmentFormDate, setAppointmentFormDate] = useState<Date | null>(null);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);

  const filterAppointments = useCallback(
    (list: Appointment[]) =>
      q.trim()
        ? list.filter(
            (a) =>
              a.client.toLowerCase().includes(q.toLowerCase()) ||
              a.service.toLowerCase().includes(q.toLowerCase()),
          )
        : list,
    [q],
  );

  const visibleAppointments = useMemo(
    () =>
      filterAppointments(allAppointments)
        .filter((a) => !hiddenPlatforms.has(a.platform))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [allAppointments, filterAppointments, hiddenPlatforms],
  );

  const todayVisibleAppts: Appointment[] = useMemo(() => {
    return visibleAppointments.filter((a) => overlapsToday(a.start, a.durationMin));
  }, [visibleAppointments]);

  const groupedUpcoming = useMemo(() => {
    const now = Date.now();
    return groupByDay(visibleAppointments.filter((a) => a.start.getTime() >= now));
  }, [visibleAppointments]);

  const groupedPast = useMemo(() => {
    const now = Date.now();
    return groupByDay(
      [...visibleAppointments]
        .filter((a) => a.start.getTime() < now)
        .sort((a, b) => b.start.getTime() - a.start.getTime()),
    );
  }, [visibleAppointments]);

  const sorted = todayVisibleAppts;

  const next = useMemo(() => {
    const now = Date.now();
    return visibleAppointments.find((a) => a.start.getTime() > now);
  }, [visibleAppointments]);

  const conflictCandidates = useMemo(() => {
    const now = Date.now();
    return visibleAppointments.filter((a) => a.start.getTime() + a.durationMin * 60_000 >= now);
  }, [visibleAppointments]);

  const conflicts = useMemo(() => findConflicts(conflictCandidates), [conflictCandidates]);
  const conflictIds = new Set(conflicts.map((c) => c.id));

  const handleAddNew = useCallback((date: Date = new Date()) => {
    setEditingAppt(null);
    setAppointmentFormDate(date);
  }, []);

  const handleEdit = useCallback((appt: Appointment) => {
    setDetailAppt(null);
    setAppointmentFormDate(null);
    setEditingAppt(appt);
  }, []);

  const togglePlatform = (id: PlatformId) => {
    setHiddenPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const platformsInDay = useMemo(() => {
    const set = new Set<PlatformId>();
    for (const a of allAppointments) set.add(a.platform);
    return Array.from(set).sort((a, b) => PLATFORMS[a].label.localeCompare(PLATFORMS[b].label));
  }, [allAppointments]);

  useEffect(() => {
    if (conflicts.length > 0) setResolverOpen(true);
  }, [conflicts.length]);

  const [{ greeting, today }, setNow] = useState<{ greeting: string; today: string }>({
    greeting: "Hello",
    today: "Today",
  });

  useEffect(() => {
    const d = new Date();
    const h = d.getHours();
    const g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const t = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    setNow({ greeting: g, today: t });
  }, []);

  const sync = async () => {
    if (!billing?.hasPaidAccess) {
      toast.error("Upgrade to sync platforms.", {
        description: "Free users can view and add appointments, but live calendar sync is limited.",
      });
      return;
    }
    setSyncing(true);
    try {
      const icalPromise = listFeeds()
        .then(({ feeds }) =>
          Promise.allSettled(
            feeds.map((f) => refreshFeed({ data: { platform: f.platform } }).then(() => true)),
          ),
        )
        .catch((err) => {
          console.error("Manual iCal sync failed", err);
          return [] as PromiseSettledResult<boolean>[];
        });

      const results = await Promise.allSettled([
        syncGoogle(),
        syncOutlook(),
        syncSquare(),
        syncCalendly(),
        syncAcuity(),
        syncZoho(),
      ]);
      const icalResults = await icalPromise;
      const labels = [
        "Google Calendar",
        "Outlook Calendar",
        "Square",
        "Calendly",
        "Acuity",
        "Zoho Bookings",
      ];
      let totalSynced = 0;
      let totalSkipped = 0;
      let anyConnected = false;
      const errors: string[] = [];
      const perPlatform: string[] = [];

      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (r.value.connected) {
            anyConnected = true;
            totalSynced += r.value.synced;
            totalSkipped += r.value.skipped;
            perPlatform.push(`${labels[i]}: ${r.value.synced}`);
          } else if ((r.value as { needsReconnect?: boolean }).needsReconnect) {
            errors.push(`${labels[i]}: reconnect required`);
          }
        } else {
          errors.push(`${labels[i]}: ${(r.reason as Error).message}`);
        }
      });

      const syncedAnyIcal = Array.isArray(icalResults)
        ? icalResults.some((r) => r.status === "fulfilled" && r.value)
        : false;
      if (syncedAnyIcal) {
        anyConnected = true;
        perPlatform.push("iCal feeds refreshed");
      }
      if (Array.isArray(icalResults)) {
        icalResults.forEach((r) => {
          if (r.status === "rejected") {
            errors.push(`iCal: ${(r.reason as Error).message}`);
          }
        });
      }

      const blockResult = await syncBlocks();
      const blocksUpdated = blockResult.googleUpdated > 0 || blockResult.outlookUpdated > 0;
      if (blockResult.googleUpdated || blockResult.outlookUpdated) {
        perPlatform.push(
          `Blocks: Google ${blockResult.googleUpdated}, Outlook ${blockResult.outlookUpdated}`,
        );
      }
      blockResult.reasons.forEach((reason) => errors.push(reason));

      if (anyConnected || totalSynced > 0 || blocksUpdated) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["appointments"] }),
          qc.invalidateQueries({ queryKey: ["ical-feeds"] }),
          qc.invalidateQueries({ queryKey: ["platform-connections"] }),
        ]);
        toast.success(
          `Synced ${totalSynced} appointment${totalSynced === 1 ? "" : "s"}` +
            (totalSkipped ? ` · skipped ${totalSkipped}` : ""),
          { description: perPlatform.join(" · ") || undefined },
        );
      } else if (errors.length === 0) {
        toast.message("No platforms connected", {
          description: "Go to Platforms to link a booking platform.",
        });
      }
      errors.forEach((e) => toast.error(e));
      setLastSync(new Date());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const saveAppointment = useMutation({
    mutationFn: async (appt: Appointment) => {
      const ends = new Date(appt.start.getTime() + appt.durationMin * 60_000);
      const isNew = appt.id.startsWith("walkin-");
      const created = await upsertFn({
        data: {
          ...(isNew ? {} : { id: appt.id }),
          source_platform: sourcePlatformFor(appt, isNew),
          client_name: appt.client,
          service: appt.service,
          starts_at: appt.start.toISOString(),
          ends_at: ends.toISOString(),
          is_block: true,
          note: appt.notes ?? null,
        },
      });
      let blockReason: string | undefined;
      if (billing?.hasPaidAccess) {
        try {
          const res = await pushBlockFn({ data: { id: (created as { id: string }).id } });
          blockReason = res.reason;
        } catch (e) {
          blockReason = (e as Error).message;
        }
      } else {
        blockReason = "upgrade required";
      }
      return { blockReason, isNew };
    },
    onSuccess: ({ blockReason, isNew }) => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setAppointmentFormDate(null);
      setEditingAppt(null);
      const action = isNew ? "added" : "saved";
      if (blockReason) {
        toast.success(`Appointment ${action}`, {
          description: `Calendar block skipped: ${blockReason}`,
        });
      } else {
        toast.success(`Appointment ${action} · time blocked on Google & Outlook`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reschedule = useMutation({
    mutationFn: async (vars: { id: string; newStart: Date; durationMin: number }) => {
      const ends = new Date(vars.newStart.getTime() + vars.durationMin * 60_000);
      return await rescheduleFn({
        data: {
          id: vars.id,
          starts_at: vars.newStart.toISOString(),
          ends_at: ends.toISOString(),
        },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      if (res.reason) {
        toast.success("Rescheduled", { description: res.reason });
      } else {
        toast.success("Rescheduled · synced to Google Calendar");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const firstName =
    profile?.first_name?.trim() || profile?.display_name?.trim().split(/\s+/)[0] || "";

  return (
    <main className="mx-auto max-w-2xl px-5 pb-10 pt-8">
      <header className="mb-8">
        <p
          className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent"
          suppressHydrationWarning
        >
          <span className="h-1 w-1 rounded-full bg-accent" />
          {today}
        </p>
        <h1
          className="mt-2 text-3xl font-extrabold tracking-tight text-foreground"
          suppressHydrationWarning
        >
          {greeting}
          {firstName ? (
            <>
              , <span className="text-accent">{firstName}</span>
            </>
          ) : null}
        </h1>
      </header>

      {search.verify === "email" && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-foreground">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <p className="font-medium">Check your email to confirm your account</p>
            <p className="mt-0.5 text-muted-foreground">
              We sent a confirmation link to your inbox. Click it to finish signing up.
            </p>
          </div>
        </div>
      )}

      {next ? (
        <section
          aria-label="Next appointment"
          className="relative overflow-hidden rounded-xl bg-primary p-7 text-primary-foreground"
          style={{
            backgroundImage:
              "radial-gradient(120% 80% at 100% 0%, oklch(0.58 0.09 262 / 0.18), transparent 55%)",
            boxShadow: "var(--shadow-elegant)",
          }}
        >
          <div className="absolute left-0 top-0 h-full w-1 bg-accent" aria-hidden />
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Next appointment
          </div>
          <div className="mt-5 text-6xl font-black leading-none tracking-tight">
            {formatTime(next.start)}
          </div>
          <div className="mt-5 h-px w-10 bg-accent" aria-hidden />
          <div className="mt-5 text-base font-semibold">{next.client}</div>
          <div className="text-sm opacity-70">
            {next.service} · {next.durationMin} min
          </div>
          <div className="mt-4">
            <PlatformBadge platform={next.platform} />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm font-medium text-foreground">
            {isLoading ? "Loading…" : "No upcoming appointments"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect a platform or add an appointment to get started.
          </p>
        </section>
      )}

      <div className="mt-5 flex items-center justify-between gap-2.5">
        <Button onClick={sync} disabled={syncing} className="flex-1">
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync platforms"}
        </Button>
        <Button onClick={() => handleAddNew(new Date())} variant="outline" className="flex-1">
          <Plus className="h-4 w-4" />
          Add appointment
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
        Calendar is up to date · {formatTime(lastSync)}
      </p>

      {conflicts.length > 0 && (
        <button
          type="button"
          onClick={() => setResolverOpen(true)}
          className="mt-4 flex w-full items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/15"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {conflicts.length} overlapping appointment{conflicts.length > 1 ? "s" : ""} at{" "}
            {formatTime(conflicts[0].start)}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider">Resolve</span>
        </button>
      )}

      {platformsInDay.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filter
          </span>
          {platformsInDay.map((id) => {
            const p = PLATFORMS[id];
            const isHidden = hiddenPlatforms.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => togglePlatform(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                  isHidden
                    ? "border-border bg-muted/50 text-muted-foreground opacity-60"
                    : "border-border bg-card text-foreground shadow-sm",
                )}
                title={isHidden ? `Show ${p.label}` : `Hide ${p.label}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.colorVar, opacity: isHidden ? 0.3 : 1 }}
                />
                {p.label}
                {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      )}

      <section className="mt-7">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients or services"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs defaultValue="list" className="mb-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list" className="gap-1.5">
              <List className="h-3.5 w-3.5" /> List
            </TabsTrigger>
            <TabsTrigger value="day" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Day
            </TabsTrigger>
            <TabsTrigger value="week" className="gap-1.5">
              <CalendarCheck2 className="h-3.5 w-3.5" /> Week
            </TabsTrigger>
            <TabsTrigger value="month" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" /> Month
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <Tabs defaultValue="today">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
              </TabsList>
              <TabsContent value="today" className="mt-4">
                <div className="mb-3 flex items-baseline justify-between border-b-2 border-foreground pb-2">
                  <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-foreground">
                    <span className="h-2 w-2 bg-accent" />
                    Today
                  </h2>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                    {sorted.length} appts
                  </span>
                </div>
                {sorted.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading..." : "Nothing on the schedule yet."}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sorted.map((a) => (
                      <AppointmentRow
                        key={a.id}
                        appt={a}
                        conflict={conflictIds.has(a.id)}
                        onClick={() => setDetailAppt(a)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="upcoming" className="mt-4 flex flex-col gap-4">
                {isLoading && (
                  <p className="text-center text-sm text-muted-foreground">Loading...</p>
                )}
                {!isLoading && groupedUpcoming.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {q.trim() ? "No matching appointments." : "No future appointments yet."}
                  </p>
                )}
                {groupedUpcoming.map(([day, list]) => (
                  <section key={day}>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {day}
                    </h2>
                    <div className="flex flex-col gap-2">
                      {list.map((a) => (
                        <AppointmentRow
                          key={a.id}
                          appt={a}
                          conflict={conflictIds.has(a.id)}
                          onClick={() => setDetailAppt(a)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </TabsContent>
              <TabsContent value="past" className="mt-4 flex flex-col gap-4">
                {!isLoading && groupedPast.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No past appointments yet.
                  </p>
                )}
                {groupedPast.map(([day, list]) => (
                  <section key={day}>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {day}
                    </h2>
                    <div className="flex flex-col gap-2">
                      {list.map((a) => (
                        <AppointmentRow
                          key={a.id}
                          appt={a}
                          conflict={conflictIds.has(a.id)}
                          onClick={() => setDetailAppt(a)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="day" className="mt-4">
            <DayTimelineView
              appointments={visibleAppointments}
              onSelect={setDetailAppt}
              onAddNew={handleAddNew}
            />
          </TabsContent>

          <TabsContent value="week" className="mt-4">
            <WeekView
              appointments={visibleAppointments}
              onSelect={setDetailAppt}
              onAddNew={handleAddNew}
            />
          </TabsContent>

          <TabsContent value="month" className="mt-4">
            <MonthGridView
              appointments={visibleAppointments}
              onSelect={setDetailAppt}
              onSelectDay={handleAddNew}
              onAddNew={handleAddNew}
            />
          </TabsContent>
        </Tabs>
      </section>

      <ConflictResolverDialog
        open={resolverOpen}
        onOpenChange={setResolverOpen}
        conflicts={conflicts}
        onReschedule={(id, newStart) => {
          const appt = visibleAppointments.find((a) => a.id === id);
          if (!appt) return;
          reschedule.mutate({ id, newStart, durationMin: appt.durationMin });
          setResolverOpen(false);
        }}
      />
      <WalkInDialog
        open={!!appointmentFormDate || !!editingAppt}
        onOpenChange={(o) => {
          if (o) return;
          setAppointmentFormDate(null);
          setEditingAppt(null);
        }}
        onAdd={(appt) => saveAppointment.mutate(appt)}
        initialDate={appointmentFormDate}
        editingAppointment={editingAppt}
      />
      <AppointmentDetailDialog
        appt={detailAppt}
        open={!!detailAppt}
        onOpenChange={(o) => !o && setDetailAppt(null)}
        onEdit={handleEdit}
      />
    </main>
  );
}
