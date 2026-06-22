import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

// ── Shared time-grid helpers ──────────────────────────────────────────────────

function apptTopPx(start: Date): number {
  const mins = (start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes();
  return (mins / 60) * HOUR_PX;
}

function apptHeightPx(durationMin: number): number {
  return Math.max(20, (durationMin / 60) * HOUR_PX);
}

// ── Today / Day Timeline View ─────────────────────────────────────────────────

export function DayTimelineView({
  appointments,
  onSelect,
  onAddNew,
}: {
  appointments: Appointment[];
  onSelect?: (a: Appointment) => void;
  onAddNew?: (date: Date) => void;
}) {
  const [day, setDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const nowLineRef = useRef<HTMLDivElement>(null);

  const dayAppts = useMemo(
    () => appointments.filter((a) => sameDay(a.start, day)).sort((a, b) => +a.start - +b.start),
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

  // Scroll to current time on mount
  useEffect(() => {
    if (nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const isToday = sameDay(day, new Date());

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              t.setHours(0, 0, 0, 0);
              setDay(t);
            }}
            className={cn("text-sm font-semibold", isToday ? "text-accent" : "text-foreground")}
          >
            {isToday
              ? "Today · " + day.toLocaleDateString([], { month: "short", day: "numeric" })
              : day.toLocaleDateString([], {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
          </button>
          {onAddNew && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onAddNew(day)}
              aria-label="Add appointment"
              title="Pencil in an appointment"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setDay((d) => addDays(d, 1))}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div
        className="overflow-y-auto rounded-lg border border-border"
        style={{ maxHeight: "520px" }}
      >
        <div className="relative flex">
          {/* Hour labels */}
          <div className="w-12 shrink-0 select-none">
            {hours.map((h) => (
              <div
                key={h}
                className="relative flex items-start justify-end pr-2"
                style={{ height: HOUR_PX }}
              >
                <span className="mt-[-0.5em] text-[10px] text-muted-foreground">
                  {formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Grid + events */}
          <div
            className="relative flex-1 border-l border-border"
            style={{ height: (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_PX }}
          >
            {/* Hour lines */}
            {hours.map((h) => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-border/50"
                style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}
              />
            ))}

            {/* Now indicator */}
            {nowOffset !== null && (
              <div
                ref={nowLineRef}
                className="absolute inset-x-0 z-10 flex items-center"
                style={{ top: nowOffset }}
              >
                <div className="h-2 w-2 rounded-full bg-accent" />
                <div className="h-px flex-1 bg-accent" />
              </div>
            )}

            {/* Appointments */}
            {dayAppts.map((a) => {
              const p = PLATFORMS[a.platform] ?? PLATFORMS.google;
              const top = apptTopPx(a.start);
              const height = apptHeightPx(a.durationMin);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect?.(a)}
                  className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:brightness-95"
                  style={{
                    top,
                    height,
                    borderLeft: `3px solid ${p.colorVar}`,
                    background: `${p.colorVar}18`,
                  }}
                >
                  <div className="truncate font-semibold text-foreground">{a.client}</div>
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

// ── Week View ─────────────────────────────────────────────────────────────────

export function WeekView({
  appointments,
  onSelect,
  onAddNew,
}: {
  appointments: Appointment[];
  onSelect?: (a: Appointment) => void;
  onAddNew?: (date: Date) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const today = new Date();

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const k = `${a.start.getFullYear()}-${a.start.getMonth()}-${a.start.getDate()}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return map;
  }, [appointments]);

  const nowOffset = useMemo(() => {
    const now = new Date();
    const mins = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
    if (mins < 0 || mins > (DAY_END_HOUR - DAY_START_HOUR) * 60) return null;
    return (mins / 60) * HOUR_PX;
  }, []);

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    if (weekStart.getMonth() === end.getMonth()) {
      return `${weekStart.toLocaleDateString([], { month: "long", year: "numeric" })} · ${weekStart.getDate()}–${end.getDate()}`;
    }
    return `${weekStart.toLocaleDateString([], { month: "short" })} ${weekStart.getDate()} – ${end.toLocaleDateString([], { month: "short" })} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="text-sm font-semibold text-foreground"
        >
          {weekLabel}
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div
        className="overflow-x-auto overflow-y-auto rounded-lg border border-border"
        style={{ maxHeight: "520px" }}
      >
        <div className="flex" style={{ minWidth: "560px" }}>
          {/* Hour labels column */}
          <div className="w-10 shrink-0 select-none border-r border-border">
            {/* Day header spacer */}
            <div className="h-10 border-b border-border" />
            {hours.map((h) => (
              <div
                key={h}
                className="relative flex items-start justify-end pr-1"
                style={{ height: HOUR_PX }}
              >
                <span className="mt-[-0.5em] text-[9px] text-muted-foreground">
                  {formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const k = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const dayAppts = (apptsByDay.get(k) ?? []).sort((a, b) => +a.start - +b.start);
            const isTodayCol = sameDay(day, today);

            return (
              <div key={k} className="group relative flex-1 border-r border-border last:border-r-0">
                {/* Day header */}
                <div
                  className={cn(
                    "sticky top-0 z-10 flex h-10 flex-col items-center justify-center border-b border-border text-xs",
                    isTodayCol ? "bg-accent/10" : "bg-card",
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {day.toLocaleDateString([], { weekday: "short" })}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      isTodayCol ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Time grid */}
                <div
                  className="relative"
                  style={{ height: (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_PX }}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-border/40"
                      style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}
                    />
                  ))}

                  {/* Now line */}
                  {isTodayCol && nowOffset !== null && (
                    <div
                      className="absolute inset-x-0 z-10 border-t-2 border-accent"
                      style={{ top: nowOffset }}
                    />
                  )}

                  {/* Pencil-in button on hover */}
                  {onAddNew && (
                    <button
                      type="button"
                      className="absolute right-0.5 top-0.5 z-20 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                      onClick={() => onAddNew(day)}
                      aria-label="Add appointment"
                      title="Pencil in appointment"
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}

                  {/* Appointments */}
                  {dayAppts.map((a) => {
                    const p = PLATFORMS[a.platform] ?? PLATFORMS.google;
                    const top = apptTopPx(a.start);
                    const height = apptHeightPx(a.durationMin);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelect?.(a)}
                        className="absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] transition-colors hover:brightness-95"
                        style={{
                          top,
                          height,
                          background: `${p.colorVar}22`,
                          borderLeft: `2px solid ${p.colorVar}`,
                        }}
                      >
                        <div className="truncate font-semibold leading-tight text-foreground">
                          {a.client}
                        </div>
                        {height > 28 && (
                          <div className="truncate text-[9px] text-muted-foreground">
                            {formatTime(a.start)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month Grid View ───────────────────────────────────────────────────────────

export function MonthGridView({
  appointments,
  onSelectDay,
  onAddNew,
}: {
  appointments: Appointment[];
  onSelectDay?: (d: Date) => void;
  onAddNew?: (date: Date) => void;
}) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
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
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
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
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
          <div
            key={i}
            className="bg-muted/50 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c.date) {
            return <div key={i} className="min-h-16 bg-card/40" />;
          }
          const cellDate = c.date;
          const k = `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`;
          const list = byDay.get(k) ?? [];
          const isToday = sameDay(cellDate, today);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay?.(cellDate)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDay?.(cellDate);
                }
              }}
              className="group relative flex min-h-16 flex-col items-start gap-1 bg-card p-1.5 text-left transition-colors hover:bg-accent/5"
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    isToday ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  {c.date.getDate()}
                </span>
                {onAddNew && (
                  <button
                    type="button"
                    className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddNew(cellDate);
                    }}
                    aria-label="Add appointment"
                  >
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
              {/* Show up to 2 event pills */}
              <div className="flex w-full flex-col gap-0.5">
                {list.slice(0, 2).map((a) => {
                  const p = PLATFORMS[a.platform] ?? PLATFORMS.google;
                  return (
                    <div
                      key={a.id}
                      className="truncate rounded px-1 text-[9px] font-medium leading-4"
                      style={{
                        background: `${p.colorVar}22`,
                        color: p.colorVar,
                        borderLeft: `2px solid ${p.colorVar}`,
                      }}
                    >
                      {a.client}
                    </div>
                  );
                })}
                {list.length > 2 && (
                  <span className="text-[9px] text-muted-foreground">+{list.length - 2} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
