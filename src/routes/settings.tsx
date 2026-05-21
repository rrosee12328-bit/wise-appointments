import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon, Monitor } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Jey Link" },
      { name: "description", content: "Profile, appearance, notifications and billing." },
      { property: "og:title", content: "Settings — Jey Link" },
      { property: "og:description", content: "Manage your Jey Link preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { mode, setMode } = useTheme();
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyConflicts, setNotifyConflicts] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(false);

  const themes = [
    { id: "system" as const, label: "System", icon: Monitor },
    { id: "light" as const, label: "Light", icon: Sun },
    { id: "dark" as const, label: "Dark", icon: Moon },
  ];

  return (
    <main className="mx-auto max-w-md px-4 pt-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </header>

      <Section title="Profile">
        <div className="flex items-center gap-3 rounded-md border bg-card p-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground"
            style={{ backgroundColor: "var(--primary)" }}
          >
            JL
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">Jey Link</div>
            <div className="truncate text-xs text-muted-foreground">jey@example.com</div>
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-card p-2">
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md py-3 text-xs font-medium transition-colors",
                mode === id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Notifications">
        <Row label="New bookings" checked={notifyNew} onChange={setNotifyNew} />
        <Row label="Conflict warnings" checked={notifyConflicts} onChange={setNotifyConflicts} />
        <Row label="Daily digest" checked={notifyDigest} onChange={setNotifyDigest} />
      </Section>

      <Section title="Billing">
        <div className="rounded-md border bg-card p-4">
          <div className="text-sm font-medium text-foreground">Pro plan</div>
          <div className="mb-3 text-xs text-muted-foreground">$12 / month · renews May 28</div>
          <Button variant="outline" size="sm">
            Manage subscription
          </Button>
        </div>
      </Section>

      <Section title="About">
        <div className="rounded-md border bg-card p-4 text-xs text-muted-foreground">
          Jey Link · v0.1.0
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border bg-card p-4">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
