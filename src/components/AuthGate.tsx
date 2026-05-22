import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PREFIXES = ["/signin", "/signup", "/login", "/reset-password", "/api/"];

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

  if (!loading && !session && !isPublic) return null;
  return <>{children}</>;
}
