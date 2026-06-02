import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";

const PLACEHOLDER: Partial<Record<PlatformId, string>> = {
  booksy: "booksy.com/en-us/your-shop",
  thecut: "thecut.co/yourhandle",
  setmore: "yourshop.setmore.com",
  squire: "getsquire.com/booking/your-shop",
  vagaro: "vagaro.com/yourshop",
  barberly: "barberly.com/yourshop",
  ringmybarber: "ringmybarber.com/yourshop",
  goldie: "heygoldie.com/yourhandle",
  glossgenius: "glossgenius.com/yourhandle",
  styleseat: "styleseat.com/yourhandle",
  fresha: "fresha.com/a/your-shop",
  mangomint: "yourshop.mangomint.com",
  boulevard: "joinblvd.com/yourshop",
  simplybook: "yourshop.simplybook.me",
};

export function LinkPlatformDialog({
  open,
  onOpenChange,
  platform,
  onConnect,
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformId | null;
  onConnect: (handle: string) => Promise<void>;
  isLoading?: boolean;
}) {
  const [handle, setHandle] = useState("");

  useEffect(() => {
    if (open) setHandle("");
  }, [open, platform]);

  if (!platform) return null;
  const p = PLATFORMS[platform];
  const placeholder = PLACEHOLDER[platform] ?? "Your booking page URL or username";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    await onConnect(handle.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link {p.label}</DialogTitle>
          <DialogDescription>
            {p.label} doesn't expose a direct API, so Jey Link reads its
            bookings through your connected Google or Outlook Calendar. Paste
            your {p.label} booking page so we can tag the matching events.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handle">Booking page URL or username</Label>
            <Input
              id="handle"
              placeholder={placeholder}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Events whose title, notes, or location mention this will appear
              under {p.label} in your appointments.
            </p>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!handle.trim() || isLoading}>
              {isLoading ? "Linking…" : "Link account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
