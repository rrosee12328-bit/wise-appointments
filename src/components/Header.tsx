import { Link } from "@tanstack/react-router";
import { Plus, Menu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Schedule" },
  { to: "/calendar", label: "Calendar" },
  { to: "/clients", label: "Clients" },
  { to: "/services", label: "Services" },
  { to: "/integrations", label: "Integrations" },
  { to: "/settings", label: "Settings" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-display font-semibold text-xl tracking-tight">
            Steady
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                activeProps={{ className: "text-foreground" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden sm:inline-flex text-sm font-medium bg-primary text-primary-foreground py-2 pl-2 pr-3 rounded-md ring-1 ring-primary items-center gap-2 hover:bg-accent transition-colors"
          >
            <Plus className="size-4" />
            New Appointment
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className="md:hidden p-2 rounded-md hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      <div
        className={cn(
          "md:hidden border-t border-border/60 bg-background overflow-hidden transition-[max-height] duration-200",
          open ? "max-h-96" : "max-h-0",
        )}
      >
        <nav className="px-6 py-3 flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="py-2 text-sm font-medium text-muted-foreground"
              activeProps={{ className: "text-foreground" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="mt-2 inline-flex justify-center text-sm font-medium bg-primary text-primary-foreground py-2 px-3 rounded-md items-center gap-2"
          >
            <Plus className="size-4" />
            New Appointment
          </button>
        </nav>
      </div>
    </header>
  );
}
