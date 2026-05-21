import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppointmentRow } from "@/components/AppointmentCard";
import {
  UPCOMING_APPOINTMENTS,
  PAST_APPOINTMENTS,
  formatRelativeDay,
  type Appointment,
} from "@/lib/mock-data";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — Jey Link" },
      { name: "description", content: "Search upcoming and past appointments across every platform." },
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

  const filter = (list: Appointment[]) =>
    q.trim()
      ? list.filter(
          (a) =>
            a.client.toLowerCase().includes(q.toLowerCase()) ||
            a.service.toLowerCase().includes(q.toLowerCase()),
        )
      : list;

  const upcoming = useMemo(
    () => groupByDay(filter([...UPCOMING_APPOINTMENTS].sort((a, b) => +a.start - +b.start))),
    [q],
  );
  const past = useMemo(
    () => groupByDay(filter([...PAST_APPOINTMENTS].sort((a, b) => +b.start - +a.start))),
    [q],
  );

  return (
    <main className="mx-auto max-w-md px-4 pt-8">
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

      <Tabs defaultValue="upcoming">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4 flex flex-col gap-4">
          {upcoming.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No matching appointments.</p>
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
          {past.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No matching appointments.</p>
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
    </main>
  );
}
