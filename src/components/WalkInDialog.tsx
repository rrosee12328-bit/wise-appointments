import { useState } from "react";
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
import type { Appointment } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (appt: Appointment) => void;
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

export function WalkInDialog({ open, onOpenChange, onAdd }: Props) {
  const [client, setClient] = useState("");
  const [service, setService] = useState("Haircut");
  const [duration, setDuration] = useState(30);
  const [time, setTime] = useState(() => toTimeInput(roundedNow()));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    onAdd({
      id: `walkin-${Date.now()}`,
      start,
      durationMin: duration,
      client: client.trim(),
      service: service.trim() || "Walk-in",
      platform: "google",
      notes: "Walk-in · blocked across all platforms",
    });
    setClient("");
    setService("Haircut");
    setDuration(30);
    setTime(toTimeInput(roundedNow()));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add walk-in</DialogTitle>
          <DialogDescription>
            Blocks this time across every connected platform immediately.
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
              placeholder="Walk-in client name"
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
              <Label htmlFor="walkin-time">Start</Label>
              <Input
                id="walkin-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
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
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Block time slot</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
