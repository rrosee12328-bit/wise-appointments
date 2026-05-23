import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { type Appointment, formatTime } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOUR_PX = 56;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function DayTimelineView({
  appointments,
  onSelect,
}: {
  appointments: Appointment[];
  onSelect?: (a: Appointment) => void;
}) {
  const [day, setDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const dayAppts = useMemo(
    () =>
      appointments
        .filter((a) => sameDay(a.start, day))
        .sort((a, b) => +a.start - +b.start),
    [appointments, day],
  );

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const nowOffset = useMemo(() => {
    if (!sameDay(day, new Date())) return null;
    const now = new Date();
    const mins = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
    if (mins < 0 || mins > (DAY_END_HOUR - DAY_START_HOUR) * 60) return null;
    return (mins / 60) * HOUR_PX;
  }, [day]);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setDay((d) => addDays(d, -1))}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => {
            const t = new Date();
            t.setHours(0, 0, 0, 0);
            setDay(t);
          }}
          className="text-sm font-semibold text-foreground"
        >
          {day.toLocaleDateString([], {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setDay((d) => addDays(d, 1))}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative rounded-lg border border-border bg-card">
        <div
          className="relative"
          style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}
        >
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 right-0 flex items-start"
              style={{ top: i * HOUR_PX, height: HOUR_PX }}
            >
              <div className="w-14 shrink-0 pl-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {h === 12
                  ? "12 PM"
                  : h === 0
                    ? "12 AM"
                    : h < 12
                      ? `${h} AM`
                      : `${h - 12} PM`}
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>
          ))}

          {nowOffset != null && (
            <div
              className="pointer-events-none absolute left-14 right-2 z-10 flex items-center"
              style={{ top: nowOffset }}
            >
              <span className="h-2 w-2 rounded-full bg-destructive" />
              <span className="ml-[-1px] h-px flex-1 bg-destructive" />
            </div>
          )}

          <div className="absolute inset-y-0 left-14 right-2">
            {dayAppts.map((a) => {
              const startMin =
                (a.start.getHours() - DAY_START_HOUR) * 60 + a.start.getMinutes();
              const top = (startMin / 60) * HOUR_PX;
              const height = Math.max(22, (a.durationMin / 60) * HOUR_PX - 2);
              const p = PLATFORMS[a.platform];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect?.(a)}
                  className="absolute left-0 right-0 overflow-hidden rounded-md border border-border bg-background/95 px-2 py-1 text-left text-xs shadow-sm transition-colors hover:bg-accent/5"
                  style={{
                    top,
                    height,
                    borderLeft: `3px solid ${p.colorVar}`,
                  }}
                >
                  <div className="truncate font-semibold text-foreground">
                    {a.client}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {formatTime(a.start)} · {a.service}
                  </div>
                </button>
              );
            })}
            {dayAppts.length === 0 && (
              <div className="absolute inset-x-0 top-6 text-center text-xs text-muted-foreground">
                No appointments
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonthGridView({
  appointments,
  onSelectDay,
}: {
  appointments: Appointment[];
  onSelectDay?: (d: Date) => void;
}) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
    ).getDate();
    const arr: { date: Date | null }[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d) });
    }
    while (arr.length % 7 !== 0) arr.push({ date: null });
    return arr;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const k = `${a.start.getFullYear()}-${a.start.getMonth()}-${a.start.getDate()}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return map;
  }, [appointments]);

  const today = new Date();

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <Button
          size="icon"
          variant="ghost"
          onClick={() =>
            setCursor(
              (c) => new Date(c.getFullYear(), c.getMonth() - 1, 1),
            )
          }
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="text-sm font-semibold text-foreground"
        >
          {cursor.toLocaleDateString([], { month: "long", year: "numeric" })}
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() =>
            setCursor(
              (c) => new Date(c.getFullYear(), c.getMonth() + 1, 1),
            )
          }
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="bg-muted/50 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c.date) {
            return <div key={i} className="min-h-14 bg-card/40" />;
          }
          const k = `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}`;
          const list = byDay.get(k) ?? [];
          const isToday = sameDay(c.date, today);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay?.(c.date!)}
              className="flex min-h-14 flex-col items-start gap-1 bg-card p-1.5 text-left transition-colors hover:bg-accent/5"
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  isToday
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground",
                )}
              >
                {c.date.getDate()}
              </span>
              <div className="flex w-full flex-wrap gap-0.5">
                {list.slice(0, 3).map((a) => (
                  <span
                    key={a.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: PLATFORMS[a.platform].colorVar }}
                  />
                ))}
                {list.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{list.length - 3}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
