import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

const logo = "/jey-link-logo.png";

export function AppHeader() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3.5">
        <Link to="/" aria-label="Jey Link home" className="flex items-center gap-2">
          <img src={logo} alt="Jey Link" className="h-20 w-auto" />
        </Link>
        {loading ? null : session ? (
          <Button size="sm" variant="ghost" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        ) : (
          <Button size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
