import { createFileRoute } from "@tanstack/react-router";
import { clients } from "@/lib/mock-data";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Steady" },
      { name: "description", content: "Your client list across every platform." },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground mt-2">
          Merged from every connected platform.
        </p>
      </header>

      <div className="rounded-xl ring-1 ring-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">
                Phone
              </th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">
                Preferred service
              </th>
              <th className="text-right px-4 py-3 font-semibold">Visits</th>
              <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell">
                Last visit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                  {c.phone}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  {c.preferredService}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {c.totalVisits}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                  {c.lastVisitDaysAgo}d ago
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
