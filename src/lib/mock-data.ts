import type { PlatformId } from "./platforms";

export type Appointment = {
  id: string;
  start: Date;
  durationMin: number;
  client: string;
  service: string;
  platform: PlatformId;
  notes?: string;
  externalUrl?: string;
};


export function findConflicts(appts: Appointment[]): Appointment[] {
  const sorted = [...appts].sort((a, b) => a.start.getTime() - b.start.getTime());
  const conflicts: Appointment[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevEnd = prev.start.getTime() + prev.durationMin * 60_000;
    if (cur.start.getTime() < prevEnd) {
      if (!conflicts.includes(prev)) conflicts.push(prev);
      conflicts.push(cur);
    }
  }
  return conflicts;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatRelativeDay(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

const KNOWN_PLATFORMS: ReadonlySet<string> = new Set([
  "square","booksy","thecut","setmore","google","squire","vagaro","barberly",
  "ringmybarber","goldie","glossgenius","styleseat","fresha","mangomint",
  "boulevard","zenoti","acuity","calendly","simplybook","zoho",
]);

export function toUiAppointment(row: {
  id: string;
  source_platform: string;
  client_name: string;
  service: string | null;
  starts_at: string;
  ends_at: string;
  note: string | null;
  external_url?: string | null;
}): Appointment {
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const durationMin = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
  const sp = row.source_platform === "google_calendar" ? "google" : row.source_platform;
  const platform = (KNOWN_PLATFORMS.has(sp) ? sp : "google") as PlatformId;
  return {
    id: row.id,
    start,
    durationMin,
    client: row.client_name,
    service: row.service ?? "Appointment",
    platform,
    notes: row.note ?? undefined,
    externalUrl: row.external_url ?? undefined,
  };
}

