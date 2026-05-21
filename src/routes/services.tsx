import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { services as initial } from "@/lib/mock-data";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — Steady" },
      { name: "description", content: "Manage your services, durations and pricing." },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  const [list, setList] = useState(initial);

  const update = (id: string, patch: Partial<(typeof initial)[number]>) =>
    setList((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Services</h1>
        <p className="text-muted-foreground mt-2">
          Update duration and pricing — changes sync to every platform.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {list.map((s) => (
          <div
            key={s.id}
            className="p-5 rounded-xl ring-1 ring-black/5 bg-surface"
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className="size-3 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: s.color }}
              />
              <h3 className="text-base font-semibold flex-1">{s.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-muted-foreground">
                Duration (min)
                <input
                  type="number"
                  value={s.durationMin}
                  onChange={(e) =>
                    update(s.id, { durationMin: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-3 py-2 rounded-md ring-1 ring-border bg-background text-foreground text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Price ($)
                <input
                  type="number"
                  value={s.price}
                  onChange={(e) =>
                    update(s.id, { price: Number(e.target.value) })
                  }
                  className="mt-1 w-full px-3 py-2 rounded-md ring-1 ring-border bg-background text-foreground text-sm"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
