import type { Appointment } from "./mock-data";

export type Conflict = { a: Appointment; b: Appointment };

export function findConflicts(appts: Appointment[]): Conflict[] {
  const sorted = [...appts].sort((x, y) => x.start - y.start);
  const out: Conflict[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start >= sorted[i].end) break;
      out.push({ a: sorted[i], b: sorted[j] });
    }
  }
  return out;
}

export function isInConflict(appt: Appointment, conflicts: Conflict[]): boolean {
  return conflicts.some((c) => c.a.id === appt.id || c.b.id === appt.id);
}

export function formatMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, "0")} ${period}`;
}
