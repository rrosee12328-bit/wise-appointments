import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Appointment } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (appt: Appointment) => void;
  initialDate?: Date | null;
  editingAppointment?: Appointment | null;
};

function roundedNow(): Date {
  const d = new Date();
  const m = d.getMinutes();
  const add = m % 15 === 0 ? 0 : 15 - (m % 15);
  d.setMinutes(m + add, 0, 0);
  return d;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toDateInput(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function fromDateAndTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function defaultStart(initialDate?: Date | null): Date {
  if (!initialDate) return roundedNow();
  const d = new Date(initialDate);
  if (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  ) {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

export function WalkInDialog({
  open,
  onOpenChange,
  onAdd,
  initialDate,
  editingAppointment,
}: Props) {
  const [client, setClient] = useState("");
  const [service, setService] = useState("Haircut");
  const [duration, setDuration] = useState(30);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [time, setTime] = useState(() => toTimeInput(roundedNow()));
  const [notes, setNotes] = useState("Appointment · blocked across all platforms");
  const isEditing = Boolean(editingAppointment);

  useEffect(() => {
    if (!open) return;

    if (editingAppointment) {
      setClient(editingAppointment.client);
      setService(editingAppointment.service || "Appointment");
      setDuration(editingAppointment.durationMin);
      setDate(toDateInput(editingAppointment.start));
      setTime(toTimeInput(editingAppointment.start));
      setNotes(editingAppointment.notes ?? "");
      return;
    }

    const base = defaultStart(initialDate);
    setDate(toDateInput(base));
    setTime(toTimeInput(base));
    setClient("");
    setService("Haircut");
    setDuration(30);
    setNotes("Appointment · blocked across all platforms");
  }, [editingAppointment, initialDate, open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!client.trim()) return;
    const start = fromDateAndTime(date, time);
    onAdd({
      id: editingAppointment?.id ?? `walkin-${Date.now()}`,
      start,
      durationMin: duration,
      client: client.trim(),
      service: service.trim() || "Appointment",
      platform: editingAppointment?.platform ?? "google",
      sourcePlatform: editingAppointment?.sourcePlatform,
      notes: notes.trim() || undefined,
      externalUrl: editingAppointment?.externalUrl,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit appointment" : "Add appointment"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this appointment and refresh its calendar blocks."
              : "Blocks this time across every connected platform immediately."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="walkin-client">Client</Label>
            <Input
              id="walkin-client"
              autoFocus
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Client name"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="walkin-service">Service</Label>
            <Input
              id="walkin-service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="Haircut"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="walkin-date">Date</Label>
              <Input
                id="walkin-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="walkin-time">Start</Label>
              <Input
                id="walkin-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="walkin-duration">Duration</Label>
              <select
                id="walkin-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="walkin-notes">Notes</Label>
            <Textarea
              id="walkin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? "Save appointment" : "Book appointment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
