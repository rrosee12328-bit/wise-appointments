import { type Platform, PLATFORM_LABEL } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STYLE: Record<Platform, string> = {
  google: "bg-platform-google text-platform-google-foreground",
  square: "bg-platform-square text-platform-square-foreground",
  booksy: "bg-platform-booksy text-platform-booksy-foreground",
  fresha: "bg-platform-fresha text-platform-fresha-foreground",
  acuity: "bg-platform-acuity text-platform-acuity-foreground",
  calendly: "bg-platform-calendly text-platform-calendly-foreground",
  steady: "bg-platform-steady text-platform-steady-foreground",
};

export function PlatformBadge({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ring-black/5",
        STYLE[platform],
        className,
      )}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
