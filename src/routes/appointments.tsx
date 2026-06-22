import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, List, CalendarDays, CalendarRange, CalendarCheck2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppointmentRow } from "@/components/AppointmentCard";
import { DayTimelineView, WeekView, MonthGridView } from "@/components/CalendarViews";
import { AppointmentDetailDialog } from "@/components/AppointmentDetailDialog";
import { WalkInDialog } from "@/components/WalkInDialog";

import { useAuth } from "@/hooks/use-auth";
import { useAutoSyncPlatforms } from "@/hooks/use-auto-sync-platforms";
import { formatRelativeDay, toUiAppointment, type Appointment } from "@/lib/mock-data";
import { getAppointments, upsertAppointment } from "@/lib/appointments.functions";
import { pushAppointmentBlock } from "@/lib/appointment-writeback.functions";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — Jey Link" },
      {
        name: "description",
        content: "Search upcoming and past appointments across every platform.",
      },
      { property: "og:title", content: "Appointments — Jey Link" },
      { property: "og:description", content: "All your bookings, searchable in one place." },
    ],
  }),
  component: Appointments,
});

function groupByDay(appts: Appointment[]) {
  const map = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = formatRelativeDay(a.start);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return Array.from(map.entries());
}

function Appointments() {
  const [q, setQ] = useState("");
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [walkInDate, setWalkInDate] = useState<Date | null>(null);
  const { session } = useAuth();
  const fetchAppts = useServerFn(getAppointments);
  const upsertFn = useServerFn(upsertAppointment);
  const pushBlockFn = useServerFn(pushAppointmentBlock);
  const qc = useQueryClient();

  useAutoSyncPlatforms(!!session);

  const { data, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => fetchAppts(),
    enabled: !!session,
    // Refresh every 5 minutes so new calendar events appear without manual reload
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  const all: Appointment[] = useMemo(() => (data?.items ?? []).map(toUiAppointment), [data]);

  const filter = useCallback(
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

  const now = Date.now();
  const upcoming = useMemo(
    () =>
      groupByDay(
        filter(
          [...all].filter((a) => a.start.getTime() >= now).sort((a, b) => +a.start - +b.start),
        ),
      ),
    [all, filter, now],
  );
  const past = useMemo(
    () =>
      groupByDay(
        filter([...all].filter((a) => a.start.getTime() < now).sort((a, b) => +b.start - +a.start)),
      ),
    [all, filter, now],
  );

  // Walk-in mutation: saves to DB then pushes block to Google + Outlook
  const addWalkIn = useMutation({
    mutationFn: async (appt: Appointment) => {
      const ends = new Date(appt.start.getTime() + appt.durationMin * 60_000);
      // 1. Save to Supabase
      const created = await upsertFn({
        data: {
          source_platform: "walk_in",
          client_name: appt.client,
          service: appt.service,
          starts_at: appt.start.toISOString(),
          ends_at: ends.toISOString(),
          is_block: true,
          note: appt.notes ?? null,
        },
      });
      // 2. Push block to Google Calendar + Outlook Calendar
      let blockReason: string | undefined;
      try {
        const res = await pushBlockFn({ data: { id: (created as { id: string }).id } });
        blockReason = res.reason;
      } catch (e) {
        blockReason = (e as Error).message;
      }
      return { blockReason };
    },
    onSuccess: ({ blockReason }) => {
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      if (blockReason) {
        toast.success("Appointment added", {
          description: `Calendar block skipped: ${blockReason}`,
        });
      } else {
        toast.success("Appointment added · time blocked on Google & Outlook");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleAddNew(date: Date) {
    setWalkInDate(date);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">Appointments</h1>
      </header>

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
          <Tabs defaultValue="upcoming">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="mt-4 flex flex-col gap-4">
              {isLoading && <p className="text-center text-sm text-muted-foreground">Loading…</p>}
              {!isLoading && upcoming.length === 0 && (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {q.trim() ? "No matching appointments." : "No upcoming appointments yet."}
                </p>
              )}
              {upcoming.map(([day, list]) => (
                <section key={day}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {day}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {list.map((a) => (
                      <AppointmentRow key={a.id} appt={a} />
                    ))}
                  </div>
                </section>
              ))}
            </TabsContent>
            <TabsContent value="past" className="mt-4 flex flex-col gap-4">
              {!isLoading && past.length === 0 && (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No past appointments yet.
                </p>
              )}
              {past.map(([day, list]) => (
                <section key={day}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {day}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {list.map((a) => (
                      <AppointmentRow key={a.id} appt={a} />
                    ))}
                  </div>
                </section>
              ))}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="day" className="mt-4">
          <DayTimelineView appointments={all} onSelect={setDetailAppt} onAddNew={handleAddNew} />
        </TabsContent>

        <TabsContent value="week" className="mt-4">
          <WeekView appointments={all} onSelect={setDetailAppt} onAddNew={handleAddNew} />
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <MonthGridView appointments={all} onSelectDay={handleAddNew} onAddNew={handleAddNew} />
        </TabsContent>
      </Tabs>

      <AppointmentDetailDialog
        appt={detailAppt}
        open={!!detailAppt}
        onOpenChange={(o) => !o && setDetailAppt(null)}
      />

      <WalkInDialog
        open={!!walkInDate}
        onOpenChange={(o) => !o && setWalkInDate(null)}
        onAdd={(appt) => addWalkIn.mutate(appt)}
      />
    </main>
  );
}
