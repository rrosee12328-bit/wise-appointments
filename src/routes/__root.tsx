import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import appCss from "../styles.css?url";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/BottomNav";
import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/AuthGate";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Jey Link — Your unified appointment dashboard" },
      {
        name: "description",
        content:
          "Jey Link unifies bookings from Square, Booksy, TheCut, Setmore and Google Calendar into one calm dashboard.",
      },
      { name: "author", content: "Jey Link" },
      { property: "og:title", content: "Jey Link — Your unified appointment dashboard" },
      {
        property: "og:description",
        content: "One calm dashboard for every appointment, from every platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Jey Link — Your unified appointment dashboard" },
      { name: "description", content: "Unified Scheduler" },
      { property: "og:description", content: "Unified Scheduler" },
      { name: "twitter:description", content: "Unified Scheduler" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/VWdRVt7OnwO6YnrGjI9n4QlxJFl1/social-images/social-1779485015899-28B21D7E-23A0-481B-96A9-69488D1840E9.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/VWdRVt7OnwO6YnrGjI9n4QlxJFl1/social-images/social-1779485015899-28B21D7E-23A0-481B-96A9-69488D1840E9.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <div className="min-h-screen bg-background pb-20">
            <AppHeader />
            <Outlet />
          </div>
          <BottomNav />
          <Toaster />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
