import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sun, Moon, Monitor, LogOut } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { getProfile, updateProfile } from "@/lib/profile.functions";

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
  const { session, signOut } = useAuth();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(updateProfile);

  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyConflicts, setNotifyConflicts] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    enabled: !!session,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setPhone(profile.phone ?? "");
      setBusinessName(profile.business_name ?? "");
      setTimezone(profile.timezone ?? "America/New_York");
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      await saveProfile({
        data: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          business_name: businessName.trim() || null,
          timezone: timezone.trim() || null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const themes = [
    { id: "system" as const, label: "System", icon: Monitor },
    { id: "light" as const, label: "Light", icon: Sun },
    { id: "dark" as const, label: "Dark", icon: Moon },
  ];

  const fullName =
    `${firstName} ${lastName}`.trim() || profile?.display_name || profile?.email || "?";
  const initials =
    fullName
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

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
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{fullName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {profile?.email ?? ""}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First"
                disabled={isLoading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last"
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-name">Business name</Label>
            <Input
              id="business-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Shop or business name"
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/New_York"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || isLoading}
            className="mt-1"
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
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

      <Section title="Account">
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            toast.success("Signed out");
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
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
