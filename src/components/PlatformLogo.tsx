import { useState } from "react";
import { PLATFORMS, platformLogoUrl, type PlatformId } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export function PlatformLogo({
  platform,
  size = 36,
  className,
}: {
  platform: PlatformId;
  size?: number;
  className?: string;
}) {
  const p = PLATFORMS[platform];
  const [errored, setErrored] = useState(false);
  const initials = p.label
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: errored ? `color-mix(in oklab, ${p.colorVar} 18%, transparent)` : "white",
        color: p.colorVar,
        border: "1px solid var(--color-border)",
      }}
      aria-label={`${p.label} logo`}
    >
      {errored ? (
        <span className="text-[11px] font-semibold tracking-tight">{initials}</span>
      ) : (
        <img
          src={platformLogoUrl(platform)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-contain p-1"
        />
      )}
    </div>
  );
}
