import { createFileRoute, redirect } from "@tanstack/react-router";

const SUPABASE_VERIFY_URL = "https://jgycqlqextzbtekebads.supabase.co/auth/v1/verify";

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: typeof search.token === "string" ? search.token : "",
      type: typeof search.type === "string" ? search.type : "signup",
      redirect_to:
        typeof search.redirect_to === "string"
          ? search.redirect_to
          : typeof search.redirectTo === "string"
            ? search.redirectTo
            : "/",
    };
  },
  beforeLoad: ({ search }) => {
    const params = new URLSearchParams({
      token: search.token,
      type: search.type,
      redirect_to: search.redirect_to,
    });
    throw redirect({
      href: `${SUPABASE_VERIFY_URL}?${params.toString()}`,
    });
  },
  component: () => null,
});
