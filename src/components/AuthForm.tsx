import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

type Mode = "signin" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", search: { verify: undefined } });
  }, [loading, session, navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const fn = firstName.trim();
        const ln = lastName.trim();
        const ph = phone.trim();
        if (!fn || !ln) {
          toast.error("Please enter your first and last name.");
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              first_name: fn,
              last_name: ln,
              phone: ph || null,
              full_name: `${fn} ${ln}`.trim(),
            },
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
        navigate({ to: "/", search: { verify: "email" } });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) toast.error(error.message);
  };

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignup ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {isSignup
              ? "Get started with Jey Link in seconds."
              : "Sign in to manage your unified schedule."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => handleOAuth("google")}>
              Google
            </Button>
            <Button type="button" variant="outline" onClick={() => handleOAuth("apple")}>
              Apple
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or with email</span>
            </div>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {isSignup && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="first-name">First name</Label>
                    <Input
                      id="first-name"
                      required
                      maxLength={60}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input
                      id="last-name"
                      required
                      maxLength={60}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={32}
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : isSignup ? "Sign up" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : "No account? "}
            <Link
              to={isSignup ? "/signin" : "/signup"}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" search={{ verify: undefined }}>Back to home</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
