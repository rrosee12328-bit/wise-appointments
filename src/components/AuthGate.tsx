import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getOnboardingStatus } from "@/lib/profile.functions";

const PUBLIC_PREFIXES = [
  "/signin",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/support",
  "/auth/",
  "/api/",
];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchOnboardingStatus = useServerFn(getOnboardingStatus);

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  const shouldCheckOnboarding = !loading && Boolean(session) && !isPublic;
  const onboarding = useQuery({
    queryKey: ["onboarding-status", session?.user.id],
    queryFn: () => fetchOnboardingStatus(),
    enabled: shouldCheckOnboarding,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  useEffect(() => {
    if (!loading && !session && !isPublic) {
      navigate({ to: "/signin" });
    }
  }, [loading, session, isPublic, navigate]);

  useEffect(() => {
    if (
      shouldCheckOnboarding &&
      onboarding.data &&
      !onboarding.data.completed &&
      pathname !== "/onboarding"
    ) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [navigate, onboarding.data, pathname, shouldCheckOnboarding]);

  if (!loading && !session && !isPublic) {
    return (
      <main className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-4 text-sm font-medium text-foreground">Opening sign in…</p>
        </div>
      </main>
    );
  }

  if (shouldCheckOnboarding && onboarding.isPending) {
    return (
      <main className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-4 text-sm font-medium text-foreground">Preparing your account…</p>
        </div>
      </main>
    );
  }

  if (
    shouldCheckOnboarding &&
    onboarding.data &&
    !onboarding.data.completed &&
    pathname !== "/onboarding"
  ) {
    return null;
  }

  return <>{children}</>;
}
