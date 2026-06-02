import { ExternalLink } from "lucide-react";
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
import { PLATFORMS } from "@/lib/platforms";
import { type Appointment, formatTime } from "@/lib/mock-data";

export function AppointmentDetailDialog({
  appt,
  open,
  onOpenChange,
}: {
  appt: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!appt) return null;
  const platformLabel = PLATFORMS[appt.platform].label;
  const end = new Date(appt.start.getTime() + appt.durationMin * 60_000);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{appt.client}</DialogTitle>
          <DialogDescription>
            {appt.service} · {appt.durationMin} min
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between rounded-md bg-secondary p-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Time
              </div>
              <div className="text-base font-semibold">
                {formatTime(appt.start)} – {formatTime(end)}
              </div>
            </div>
            <PlatformBadge platform={appt.platform} />
          </div>

          {appt.notes && (
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {appt.notes}
              </p>
            </div>
          )}

          {!appt.externalUrl && (
            <p className="text-xs text-muted-foreground">
              No deep link available for this booking. Open {platformLabel} directly
              to see full details.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild disabled={!appt.externalUrl}>
            <a
              href={appt.externalUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!appt.externalUrl}
              onClick={(e) => {
                if (!appt.externalUrl) e.preventDefault();
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open in {platformLabel}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
