import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — Jey Link" },
      { name: "description", content: "Sign in to your Jey Link account." },
    ],
  }),
  component: () => <AuthForm mode="signin" />,
});
