import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, BookOpen, Bug, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Jey Link" },
      { name: "description", content: "Help articles, contact support and report issues." },
      { property: "og:title", content: "Support — Jey Link" },
      { property: "og:description", content: "Get help with Jey Link." },
    ],
  }),
  component: Support,
});

const TOPICS = [
  "Connecting a platform",
  "Re-authenticating Booksy",
  "Resolving conflicts",
  "Notifications & quiet hours",
];

function Support() {
  const [issue, setIssue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.trim()) return;
    toast.success("Issue reported. We'll be in touch.");
    setIssue("");
  };

  return (
    <main className="mx-auto max-w-md sm:max-w-2xl md:max-w-3xl lg:max-w-4xl px-4 pt-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground">We're here when you need us.</p>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> Help topics
        </h2>
        <ul className="overflow-hidden rounded-md border bg-card">
          {TOPICS.map((t, i) => (
            <li
              key={t}
              className={i > 0 ? "border-t border-border" : ""}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between p-4 text-left text-sm text-foreground hover:bg-secondary"
                onClick={() => toast("Article opening soon")}
              >
                {t}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Mail className="h-3.5 w-3.5" /> Contact
        </h2>
        <a href="mailto:support@jeylink.app" className="block">
          <Button variant="outline" className="w-full justify-start">
            <Mail className="h-4 w-4" /> support@jeylink.app
          </Button>
        </a>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bug className="h-3.5 w-3.5" /> Report an issue
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="Describe what happened…"
            rows={4}
          />
          <Button type="submit" disabled={!issue.trim()}>
            Send report
          </Button>
        </form>
      </section>
    </main>
  );
}
