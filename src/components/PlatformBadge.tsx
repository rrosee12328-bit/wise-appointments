import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export function PlatformBadge({
  platform,
  className,
}: {
  platform: PlatformId;
  className?: string;
}) {
  const p = PLATFORMS[platform];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${p.colorVar} 18%, transparent)`,
        color: p.colorVar,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: p.colorVar }}
        aria-hidden
      />
      {p.label}
    </span>
  );
}
