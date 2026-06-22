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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PLATFORMS, ICAL_INSTRUCTIONS, supportsIcal, type PlatformId } from "@/lib/platforms";

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
  onConnectIcal,
  hasRelayCalendar = true,
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformId | null;
  onConnect: (handle: string) => Promise<void>;
  onConnectIcal?: (feedUrl: string) => Promise<void>;
  hasRelayCalendar?: boolean;
  isLoading?: boolean;
}) {
  const [handle, setHandle] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [tab, setTab] = useState<"ical" | "relay">("ical");

  useEffect(() => {
    if (open) {
      setHandle("");
      setIcalUrl("");
      setTab(platform && supportsIcal(platform) ? "ical" : "relay");
    }
  }, [open, platform]);

  if (!platform) return null;
  const p = PLATFORMS[platform];
  const placeholder = PLACEHOLDER[platform] ?? "Your booking page URL or username";
  const showIcalTab = supportsIcal(platform) && !!onConnectIcal;
  const instructions = ICAL_INSTRUCTIONS[platform];

  const submitRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    await onConnect(handle.trim());
  };

  const submitIcal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!icalUrl.trim() || !onConnectIcal) return;
    await onConnectIcal(icalUrl.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {p.label}</DialogTitle>
          <DialogDescription>
            {showIcalTab
              ? `Sync ${p.label} bookings directly via its iCal feed (recommended), or fall back to relaying through Google/Outlook.`
              : `${p.label} doesn't expose a direct API, so Jey Link reads its bookings through your connected Google or Outlook Calendar.`}
          </DialogDescription>
        </DialogHeader>

        {showIcalTab ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "ical" | "relay")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ical">iCal link (recommended)</TabsTrigger>
              <TabsTrigger value="relay">Google / Outlook</TabsTrigger>
            </TabsList>

            <TabsContent value="ical" className="mt-3">
              <form onSubmit={submitIcal} className="flex flex-col gap-4">
                {instructions && (
                  <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
                    {instructions.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ical-url">iCal feed URL</Label>
                  <Input
                    id="ical-url"
                    type="url"
                    placeholder="https://… or webcal://…"
                    value={icalUrl}
                    onChange={(e) => setIcalUrl(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Bookings sync every 15 minutes — no Google/Outlook needed.
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
                  <Button type="submit" disabled={!icalUrl.trim() || isLoading}>
                    {isLoading ? "Connecting…" : "Connect iCal feed"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="relay" className="mt-3">
              <RelayForm
                platform={platform}
                handle={handle}
                setHandle={setHandle}
                placeholder={placeholder}
                onSubmit={submitRelay}
                onCancel={() => onOpenChange(false)}
                isLoading={isLoading}
                hasRelayCalendar={hasRelayCalendar}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <RelayForm
            platform={platform}
            handle={handle}
            setHandle={setHandle}
            placeholder={placeholder}
            onSubmit={submitRelay}
            onCancel={() => onOpenChange(false)}
            isLoading={isLoading}
            hasRelayCalendar={hasRelayCalendar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RelayForm({
  platform,
  handle,
  setHandle,
  placeholder,
  onSubmit,
  onCancel,
  isLoading,
  hasRelayCalendar,
}: {
  platform: PlatformId;
  handle: string;
  setHandle: (s: string) => void;
  placeholder: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isLoading: boolean;
  hasRelayCalendar: boolean;
}) {
  const label = PLATFORMS[platform].label;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 py-1">
      {!hasRelayCalendar && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Connect Google or Outlook Calendar first so {label} bookings can flow through.
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Booking page URL or username</Label>
        <Input
          id="handle"
          placeholder={placeholder}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Events whose title, notes, or location mention this will appear under {label} in your
          appointments.
        </p>
      </div>
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!handle.trim() || isLoading || !hasRelayCalendar}>
          {isLoading ? "Linking…" : "Link account"}
        </Button>
      </DialogFooter>
    </form>
  );
}
