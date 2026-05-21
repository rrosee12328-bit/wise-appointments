import { useEffect, useMemo, useState } from "react";
import { ArrowRight, AlertTriangle, ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "./PlatformBadge";
import { type Appointment, formatTime } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: Appointment[];
  onReschedule: (id: string, newStart: Date) => void;
};

const SHIFT_OPTIONS = [15, 30, 45, 60];

export function ConflictResolverDialog({ open, onOpenChange, conflicts, onReschedule }: Props) {
  const pair = useMemo(() => conflicts.slice(0, 2), [conflicts]);
  const [selectedId, setSelectedId] = useState<string | null>(pair[1]?.id ?? null);
  const [shift, setShift] = useState<number>(30);
  const [step, setStep] = useState<"pick" | "confirm">("pick");

  useEffect(() => {
    if (open) setStep("pick");
  }, [open]);

  if (pair.length < 2) return null;

  const target = pair.find((a) => a.id === selectedId) ?? pair[1];
  const newStart = new Date(target.start.getTime() + shift * 60_000);
  const other = pair.find((a) => a.id !== target.id) ?? pair[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {step === "pick" ? "Resolve conflict" : "Confirm reschedule"}
          </DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? `Two appointments overlap at ${formatTime(pair[0].start)}. Pick one to shift.`
              : "Review the change before it syncs across all platforms."}
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <>
        <div className="flex flex-col gap-2">
          {pair.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId(a.id)}
              className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                selectedId === a.id ? "border-accent bg-accent/5" : "border-border hover:bg-secondary"
              }`}
            >
              <div className="w-16 shrink-0">
                <div className="text-sm font-semibold">{formatTime(a.start)}</div>
                <div className="text-xs text-muted-foreground">{a.durationMin}m</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.client}</div>
                <div className="truncate text-xs text-muted-foreground">{a.service}</div>
              </div>
              <PlatformBadge platform={a.platform} />
            </button>
          ))}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shift by
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SHIFT_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setShift(m)}
                className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                  shift === m
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                +{m}m
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-md bg-secondary p-2 text-sm">
            <span className="font-medium">{formatTime(target.start)}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{formatTime(newStart)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => setStep("confirm")}>
            Review change
          </Button>
        </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{target.client}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {target.service} · {target.durationMin} min
                    </div>
                  </div>
                  <PlatformBadge platform={target.platform} />
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="rounded-md bg-secondary p-2 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Original
                    </div>
                    <div className="mt-1 text-base font-bold line-through opacity-70">
                      {formatTime(target.start)}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="rounded-md bg-accent/10 p-2 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      New time
                    </div>
                    <div className="mt-1 text-base font-bold text-foreground">
                      {formatTime(newStart)}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Resolves overlap with {other.client} ({formatTime(other.start)}). Change will sync to{" "}
                {target.platform === "google" ? "Google Calendar" : target.platform} and block the
                new slot across all connected platforms.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("pick")}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => {
                  onReschedule(target.id, newStart);
                  onOpenChange(false);
                }}
              >
                Switch {target.client.split(" ")[0]} to {formatTime(newStart)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}