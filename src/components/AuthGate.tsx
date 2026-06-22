import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PREFIXES = [
  "/signin",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/",
  "/api/",
];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

  useEffect(() => {
    if (!loading && !session && !isPublic) {
      navigate({ to: "/signin" });
    }
  }, [loading, session, isPublic, navigate]);

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
  return <>{children}</>;
}
