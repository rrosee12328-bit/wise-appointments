import { Link } from "@tanstack/react-router";

const logo = "/jey-link-logo.png";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3.5">
        <Link to="/" aria-label="Jey Link home" className="flex items-center gap-2">
          <img src={logo} alt="Jey Link" className="h-20 w-auto" />
        </Link>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-accent" />
          Unified
        </span>
      </div>
    </header>
  );
}