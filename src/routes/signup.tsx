import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — Jey Link" },
      { name: "description", content: "Create your Jey Link account." },
    ],
  }),
  component: () => <AuthForm mode="signup" />,
});
