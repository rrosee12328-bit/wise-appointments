import { QueryClient } from "@tanstack/react-query";
import { createRouter, Link, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Refresh the app or sign in again.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <Link
            to="/signin"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

function DefaultNotFoundComponent() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page is unavailable.</p>
        <Link
          to="/signin"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });

  return router;
};
