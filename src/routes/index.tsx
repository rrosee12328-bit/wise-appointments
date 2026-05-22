import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, CheckCircle2, Plus, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppointmentRow } from "@/components/AppointmentCard";
import { PlatformBadge } from "@/components/PlatformBadge";
import { ConflictResolverDialog } from "@/components/ConflictResolverDialog";
import { WalkInDialog } from "@/components/WalkInDialog";
import {
  TODAY_APPOINTMENTS,
  type Appointment,
  findConflicts,
  formatTime,
} from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => ({
    verify: typeof s.verify === "string" ? (s.verify as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Schedule — Jey Link" },
      { name: "description", content: "Your next appointment and today's schedule, all in one place." },
      { property: "og:title", content: "Schedule — Jey Link" },
      { property: "og:description", content: "Your next appointment, today's timeline, and platform sync status." },
    ],
  }),
  component: Schedule,
});

function Schedule() {
  const search = useSearch({ from: "/" });
  const [appointments, setAppointments] = useState<Appointment[]>(() =>
    [...TODAY_APPOINTMENTS].sort((a, b) => a.start.getTime() - b.start.getTime()),
  );
  const sorted = useMemo(
    () => [...appointments].sort((a, b) => a.start.getTime() - b.start.getTime()),
    [appointments],
  );
  const next = useMemo(() => {
    const now = Date.now();
    return sorted.find((a) => a.start.getTime() > now);
  }, [sorted]);
  const conflicts = useMemo(() => findConflicts(sorted), [sorted]);
  const conflictIds = new Set(conflicts.map((c) => c.id));
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [resolverOpen, setResolverOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  useEffect(() => {
    if (conflicts.length > 0) setResolverOpen(true);
  }, [conflicts.length]);

  const [{ greeting, today }, setNow] = useState<{ greeting: string; today: string }>({
    greeting: "Hello",
    today: "Today",
  });

  useEffect(() => {
    const compute = () => {
      const d = new Date();
      const h = d.getHours();
      const g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
      const t = d.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      setNow({ greeting: g, today: t });
    };
    compute();
  }, []);

  const sync = async () => {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 900));
    setSyncing(false);
    setLastSync(new Date());
    toast.success("Calendar is up to date");
  };

  const reschedule = (id: string, newStart: Date) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, start: newStart } : a)));
    toast.success("Appointment rescheduled · synced to all platforms");
  };

  const addWalkIn = (appt: Appointment) => {
    setAppointments((prev) => [...prev, appt]);
    toast.success(`Walk-in added · time blocked across all platforms`);
  };

  return (
    <main className="mx-auto max-w-md px-5 pb-10 pt-8">
      <header className="mb-8">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent" suppressHydrationWarning>
          <span className="h-1 w-1 rounded-full bg-accent" />
          {today}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground" suppressHydrationWarning>
          {greeting}, <span className="text-accent">Jey</span>
        </h1>
      </header>

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
          <div
            className="absolute left-0 top-0 h-full w-1 bg-accent"
            aria-hidden
          />
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
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Next appointment
          </div>
          <p className="mt-3 text-sm text-foreground">No upcoming appointments.</p>
        </section>
      )}

      <div className="mt-5 flex items-center justify-between gap-2.5">
        <Button onClick={sync} disabled={syncing} className="flex-1">
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync platforms"}
        </Button>
        <Button
          onClick={() => setWalkInOpen(true)}
          variant="outline"
          className="flex-1"
        >
          <Plus className="h-4 w-4" />
          Add walk-in
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

      <section className="mt-9">
        <div className="mb-4 flex items-baseline justify-between border-b-2 border-foreground pb-2">
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-foreground">
            <span className="h-2 w-2 bg-accent" />
            Today
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            {sorted.length} appts
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {sorted.map((a) => (
            <AppointmentRow key={a.id} appt={a} conflict={conflictIds.has(a.id)} />
          ))}
        </div>
      </section>

      <ConflictResolverDialog
        open={resolverOpen}
        onOpenChange={setResolverOpen}
        conflicts={conflicts}
        onReschedule={reschedule}
      />
      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} onAdd={addWalkIn} />
    </main>
  );
}
