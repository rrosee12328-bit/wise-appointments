import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useBillingStatus } from "@/hooks/use-billing-status";

const BILLING_ACCESS_PREFIXES = [
  "/settings",
  "/support",
  "/privacy",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/",
  "/api/",
];

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: billing, isLoading: billingLoading } = useBillingStatus(Boolean(session));
  const isBillingPath = BILLING_ACCESS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
  const needsSubscription = Boolean(session) && !billingLoading && !billing?.hasPaidAccess;

  useEffect(() => {
    if (!authLoading && needsSubscription && !isBillingPath) {
      navigate({ to: "/settings" });
    }
  }, [authLoading, isBillingPath, navigate, needsSubscription]);

  if (session && billingLoading && !isBillingPath) {
    return (
      <main className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-4 text-sm font-medium text-foreground">Checking subscription...</p>
        </div>
      </main>
    );
  }

  if (needsSubscription && !isBillingPath) {
    return (
      <main className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-5">
        <p className="text-sm font-medium text-muted-foreground">Opening plans...</p>
      </main>
    );
  }

  return <>{children}</>;
}
