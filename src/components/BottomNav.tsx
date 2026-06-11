import { Link } from "@tanstack/react-router";
import { Calendar, Plug, ListChecks, Settings, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Schedule", icon: Calendar, exact: true },
  { to: "/platforms", label: "Platforms", icon: Plug, exact: false },
  { to: "/appointments", label: "Appointments", icon: ListChecks, exact: false },
  { to: "/settings", label: "Settings", icon: Settings, exact: false },
  { to: "/support", label: "Support", icon: LifeBuoy, exact: false },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md sm:max-w-2xl md:max-w-3xl lg:max-w-4xl items-stretch justify-between px-2">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact }}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium text-muted-foreground transition-colors",
                "data-[status=active]:text-accent",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
