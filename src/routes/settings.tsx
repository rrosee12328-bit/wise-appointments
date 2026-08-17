import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { cn } from "@/lib/utils";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { createStripeCheckoutSession, createStripePortalSession } from "@/lib/stripe.functions";
import { planLabel, type BillingInterval, type PaidBillingPlan } from "@/lib/billing";

export const Route = createFileRoute("/settings")({
  validateSearch: (s: Record<string, unknown>) => ({
    billing: typeof s.billing === "string" ? (s.billing as string) : undefined,
  }),
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

function detectBrowserTimezone() {
  if (typeof window === "undefined" || typeof Intl === "undefined") return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function SettingsPage() {
  const search = Route.useSearch();
  const { mode, setMode } = useTheme();
  const { session, signOut } = useAuth();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(updateProfile);
  const startCheckout = useServerFn(createStripeCheckoutSession);
  const startPortal = useServerFn(createStripePortalSession);

  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyConflicts, setNotifyConflicts] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    enabled: !!session,
  });
  const { data: billing, isLoading: billingLoading } = useBillingStatus(!!session);

  useEffect(() => {
    if (search.billing === "success") {
      toast.success("Payment received", {
        description: "Stripe is confirming your subscription now.",
      });
      void qc.invalidateQueries({ queryKey: ["billing-status"] });
      const interval = window.setInterval(() => {
        void qc.invalidateQueries({ queryKey: ["billing-status"] });
      }, 3000);
      const timeout = window.setTimeout(() => window.clearInterval(interval), 18000);
      return () => {
        window.clearInterval(interval);
        window.clearTimeout(timeout);
      };
    } else if (search.billing === "canceled") {
      toast.info("Checkout canceled");
    }
  }, [search.billing, qc]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [detectedTimezone, setDetectedTimezone] = useState("UTC");
  const [timezoneMode, setTimezoneMode] = useState<"auto" | "manual">("auto");
  const [timezone, setTimezone] = useState(detectedTimezone);

  useEffect(() => {
    setDetectedTimezone(detectBrowserTimezone());
  }, []);

  useEffect(() => {
    if (timezoneMode === "auto") setTimezone(detectedTimezone);
  }, [detectedTimezone, timezoneMode]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setPhone(profile.phone ?? "");
      setBusinessName(profile.business_name ?? "");
      setTimezoneMode(profile.timezone ? "manual" : "auto");
      setTimezone(profile.timezone ?? detectedTimezone);
    }
  }, [detectedTimezone, profile]);

  const save = useMutation({
    mutationFn: async () => {
      await saveProfile({
        data: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          business_name: businessName.trim() || null,
          timezone: timezoneMode === "auto" ? null : timezone.trim() || detectedTimezone,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkout = useMutation({
    mutationFn: async (selection: { plan: PaidBillingPlan; interval: BillingInterval }) => {
      const { url } = await startCheckout({ data: selection });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const { url } = await startPortal();
      window.location.href = url;
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
            <div className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</div>
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
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => {
                  setTimezoneMode("auto");
                  setTimezone(detectedTimezone);
                }}
                className={cn(
                  "rounded px-3 py-2 text-xs font-medium transition-colors",
                  timezoneMode === "auto"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setTimezoneMode("manual")}
                className={cn(
                  "rounded px-3 py-2 text-xs font-medium transition-colors",
                  timezoneMode === "manual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Manual
              </button>
            </div>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder={detectedTimezone}
              disabled={isLoading || timezoneMode === "auto"}
            />
            <p className="text-xs text-muted-foreground">
              Auto uses this device's timezone: {detectedTimezone}.
            </p>
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

      <Section title="Billing">
        <div className="rounded-md border bg-card p-4">
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CreditCard className="h-4 w-4 text-accent" />
                {billingLoading
                  ? "Loading plan..."
                  : billing?.hasPaidAccess
                    ? `${planLabel(billing.plan)} active`
                    : "Free plan"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Plan: {billingLoading ? "Loading..." : planLabel(billing?.plan)}
                {billing?.billingInterval ? ` · ${billing.billingInterval}ly` : ""}
                {billing?.stripeSubscriptionStatus
                  ? ` · Stripe: ${billing.stripeSubscriptionStatus}`
                  : ""}
              </p>
              {billing?.paymentWarning ? (
                <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  Payment needs attention. Paid features stay active until{" "}
                  {billing.stripeGracePeriodEndsAt
                    ? new Date(billing.stripeGracePeriodEndsAt).toLocaleDateString()
                    : "the grace period ends"}
                  . Update your payment method to keep premium sync running.
                </p>
              ) : null}
              {billing?.stripeCancelAtPeriodEnd ? (
                <p className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Subscription canceled. Paid features remain active through the current billing
                  period, then the account moves to Free.
                </p>
              ) : null}
              {billing?.stripeCurrentPeriodEnd ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Current period ends{" "}
                  {new Date(billing.stripeCurrentPeriodEnd).toLocaleDateString()}
                </p>
              ) : null}
            </div>
            {billing?.hasPaidAccess ? (
              <Button
                variant="outline"
                onClick={() => portal.mutate()}
                disabled={portal.isPending || billingLoading}
              >
                {portal.isPending ? "Opening..." : "Manage"}
              </Button>
            ) : (
              <div className="grid gap-3">
                <BillingChoice
                  title="Pro"
                  price="$9.99/mo"
                  yearly="$99/yr"
                  description="For individual professionals. Includes a 14-day Pro trial."
                  disabled={checkout.isPending || billingLoading}
                  onMonthly={() => checkout.mutate({ plan: "pro", interval: "month" })}
                  onYearly={() => checkout.mutate({ plan: "pro", interval: "year" })}
                />
                <BillingChoice
                  title="Business"
                  price="$29.99/mo"
                  yearly="$299/yr"
                  description="For teams, multiple calendars, admin controls, and analytics."
                  disabled={checkout.isPending || billingLoading}
                  onMonthly={() => checkout.mutate({ plan: "business", interval: "month" })}
                  onYearly={() => checkout.mutate({ plan: "business", interval: "year" })}
                />
                <BillingChoice
                  title="Test checkout"
                  price="$0.50/mo"
                  description="Internal test option for confirming checkout and webhook updates."
                  disabled={checkout.isPending || billingLoading}
                  onMonthly={() => checkout.mutate({ plan: "test", interval: "month" })}
                />
              </div>
            )}
          </div>
          {!billing?.hasPaidAccess ? (
            <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Free includes one calendar, a basic appointment dashboard, limited connections, and
              limited monthly appointments. There is no setup fee. Stripe handles subscriptions,
              invoices, receipts, coupons, payment retries, and taxes when enabled in Stripe.
            </p>
          ) : null}
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

function BillingChoice({
  title,
  price,
  yearly,
  description,
  disabled,
  onMonthly,
  onYearly,
}: {
  title: string;
  price: string;
  description: string;
  disabled: boolean;
  onMonthly: () => void;
  yearly?: string;
  onYearly?: () => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          <p className="mt-2 text-xs font-medium text-foreground">
            {yearly ? `${price} · ${yearly}` : price}
          </p>
        </div>
      </div>
      <div className={cn("mt-3 grid gap-2", onYearly ? "grid-cols-2" : "grid-cols-1")}>
        <Button size="sm" onClick={onMonthly} disabled={disabled}>
          Monthly
        </Button>
        {onYearly ? (
          <Button size="sm" variant="outline" onClick={onYearly} disabled={disabled}>
            Yearly
          </Button>
        ) : null}
      </div>
    </div>
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
