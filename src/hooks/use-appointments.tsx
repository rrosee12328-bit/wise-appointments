import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Appointment } from "@/lib/mock-data";
import type { PlatformId } from "@/lib/platforms";

type Row = {
  id: string;
  client_name: string;
  service: string | null;
  source_platform: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

function rowToAppt(r: Row): Appointment {
  const start = new Date(r.starts_at);
  const end = new Date(r.ends_at);
  return {
    id: r.id,
    start,
    durationMin: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
    client: r.client_name,
    service: r.service ?? "Appointment",
    platform: r.source_platform as PlatformId,
    notes: r.note ?? undefined,
  };
}

export function useAppointments(range: "today" | "upcoming" = "today") {
  const { user, loading: authLoading } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + (range === "today" ? 1 : 14));
      const { data, error } = await supabase
        .from("appointments")
        .select("id, client_name, service, source_platform, starts_at, ends_at, note")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error(error);
        setAppointments([]);
      } else {
        setAppointments((data as Row[]).map(rowToAppt));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, range]);

  const addLocal = (a: Appointment) =>
    setAppointments((prev) => [...(prev ?? []), a]);
  const updateLocal = (id: string, patch: Partial<Appointment>) =>
    setAppointments((prev) =>
      (prev ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );

  return { appointments: appointments ?? [], loading, addLocal, updateLocal };
}
