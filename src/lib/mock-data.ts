import type { PlatformId } from "./platforms";

export type Appointment = {
  id: string;
  start: Date;
  durationMin: number;
  client: string;
  service: string;
  platform: PlatformId;
  notes?: string;
};

function at(hour: number, min: number, dayOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d;
}

export const TODAY_APPOINTMENTS: Appointment[] = [
  {
    id: "a1",
    start: at(9, 0),
    durationMin: 45,
    client: "Andre Cole",
    service: "Haircut",
    platform: "square",
  },
  {
    id: "a2",
    start: at(11, 30),
    durationMin: 30,
    client: "Priya Shah",
    service: "Lineup",
    platform: "thecut",
  },
  {
    id: "a3",
    start: at(14, 30),
    durationMin: 30,
    client: "Marcus Reed",
    service: "Beard Trim",
    platform: "booksy",
  },
  {
    id: "a4",
    start: at(16, 0),
    durationMin: 60,
    client: "Devon Hill",
    service: "Cut & Beard",
    platform: "setmore",
  },
  {
    id: "a5",
    start: at(16, 30),
    durationMin: 30,
    client: "Jordan Alvarez",
    service: "Kids Cut",
    platform: "google",
  },
];

export const UPCOMING_APPOINTMENTS: Appointment[] = [
  ...TODAY_APPOINTMENTS,
  {
    id: "b1",
    start: at(10, 0, 1),
    durationMin: 45,
    client: "Sam Patel",
    service: "Haircut",
    platform: "booksy",
  },
  {
    id: "b2",
    start: at(13, 0, 1),
    durationMin: 30,
    client: "Wes Brooks",
    service: "Beard Trim",
    platform: "square",
  },
  {
    id: "b3",
    start: at(15, 30, 2),
    durationMin: 60,
    client: "Theo Nakamura",
    service: "Cut & Beard",
    platform: "google",
  },
];

export const PAST_APPOINTMENTS: Appointment[] = [
  {
    id: "p1",
    start: at(11, 0, -1),
    durationMin: 30,
    client: "Eli Watson",
    service: "Lineup",
    platform: "thecut",
  },
  {
    id: "p2",
    start: at(15, 0, -1),
    durationMin: 45,
    client: "Noah Bennett",
    service: "Haircut",
    platform: "booksy",
  },
  {
    id: "p3",
    start: at(9, 30, -2),
    durationMin: 30,
    client: "Kai Romero",
    service: "Beard Trim",
    platform: "setmore",
  },
];

export type PlatformConnection = {
  id: PlatformId;
  status: "connected" | "reauth" | "disconnected";
  lastSync?: Date;
};

export const PLATFORM_CONNECTIONS: PlatformConnection[] = [
  { id: "booksy", status: "connected", lastSync: at(8, 12) },
  { id: "square", status: "connected", lastSync: at(8, 12) },
  { id: "google", status: "connected", lastSync: at(8, 12) },
  { id: "thecut", status: "reauth", lastSync: at(7, 0, -1) },
  { id: "setmore", status: "disconnected" },
  { id: "squire", status: "disconnected" },
  { id: "vagaro", status: "disconnected" },
  { id: "barberly", status: "disconnected" },
  { id: "ringmybarber", status: "disconnected" },
  { id: "goldie", status: "disconnected" },
  { id: "glossgenius", status: "disconnected" },
  { id: "styleseat", status: "disconnected" },
  { id: "fresha", status: "disconnected" },
  { id: "mangomint", status: "disconnected" },
  { id: "boulevard", status: "disconnected" },
  { id: "zenoti", status: "disconnected" },
  { id: "acuity", status: "disconnected" },
  { id: "calendly", status: "disconnected" },
  { id: "simplybook", status: "disconnected" },
];

export function getNextAppointment(now = new Date()): Appointment | undefined {
  return [...TODAY_APPOINTMENTS, ...UPCOMING_APPOINTMENTS]
    .filter((a) => a.start.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
}

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
