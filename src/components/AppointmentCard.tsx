import { PLATFORMS } from "@/lib/platforms";
import { type Appointment, formatTime } from "@/lib/mock-data";
import { PlatformBadge } from "./PlatformBadge";
import { cn } from "@/lib/utils";

export function AppointmentRow({
  appt,
  conflict,
  onClick,
}: {
  appt: Appointment;
  conflict?: boolean;
  onClick?: () => void;
}) {
  const p = PLATFORMS[appt.platform];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-all",
        "hover:border-foreground/15 hover:shadow-[var(--shadow-card)] border-l-[3px]",
      )}
      style={{ borderLeftColor: p.colorVar }}
    >
      <div className="w-16 shrink-0">
        <div className="text-base font-semibold tracking-tight text-foreground">
          {formatTime(appt.start)}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {appt.durationMin} min
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{appt.client}</div>
        <div className="truncate text-xs text-muted-foreground">{appt.service}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PlatformBadge platform={appt.platform} />
        {conflict && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
            Conflict
          </span>
        )}
      </div>
    </button>
  );
}
