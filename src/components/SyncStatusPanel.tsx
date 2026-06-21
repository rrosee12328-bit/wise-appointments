/**
 * SyncStatusPanel — shows Google Calendar and Outlook Calendar connection
 * status, last synced time, sync errors, manual Sync Now, Disconnect, and Reconnect buttons.
 */
import { useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock, Wifi, WifiOff, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SyncConnection = {
  platform: string;
  account_email: string | null;
  last_synced_at: string | null;
  status: string | null;
  sync_error: string | null;
  expires_at: string | null;
};

type Props = {
  connections: SyncConnection[];
  onSyncNow: (platform: string) => Promise<void>;
  onReconnect: (platform: string) => void;
  onDisconnect: (platform: string) => void;
  isSyncing: boolean;
};

const CALENDAR_PLATFORMS: { id: string; label: string; color: string }[] = [
  { id: "google_calendar", label: "Google Calendar", color: "#4285F4" },
  { id: "outlook_calendar", label: "Outlook Calendar", color: "#0078D4" },
];

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function shortenSyncError(err: string | null): string {
  if (!err) return "";
  const s = err.toLowerCase();
  if (s.includes("reconnect") || s.includes("invalid_grant") || s.includes("authorization expired"))
    return "Authorization expired";
  if (s.includes("refresh token")) return "Reconnect required";
  if (s.includes("401") || s.includes("unauthorized")) return "Unauthorized — reconnect";
  if (s.includes("403") || s.includes("forbidden")) return "Permission denied";
  if (s.includes("network") || s.includes("fetch")) return "Network error";
  if (s.includes("token refresh")) return "Token refresh failed";
  return "Sync failed";
}


export function SyncStatusPanel({ connections, onSyncNow, onReconnect, onDisconnect, isSyncing }: Props) {
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);

  const connMap = new Map(connections.map((c) => [c.platform, c]));

  async function handleSync(platformId: string) {
    setSyncingPlatform(platformId);
    try {
      await onSyncNow(platformId);
    } finally {
      setSyncingPlatform(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Calendar Sync Status</h3>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-xs"
          disabled={isSyncing || !!syncingPlatform}
          onClick={async () => {
            for (const cal of CALENDAR_PLATFORMS) {
              if (connMap.has(cal.id)) {
                await handleSync(cal.id);
              }
            }
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", (isSyncing || syncingPlatform) && "animate-spin")} />
          Sync All
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {CALENDAR_PLATFORMS.map((cal) => {
          const conn = connMap.get(cal.id);
          const isConnected = !!conn && conn.status !== "disconnected";
          const hasError = !!conn?.sync_error;
          const expired = isTokenExpired(conn?.expires_at ?? null);
          const needsReconnect = !isConnected || expired || hasError;
          const isSyncingThis = syncingPlatform === cal.id;

          return (
            <div
              key={cal.id}
              className={cn(
                "rounded-lg border p-3",
                hasError || expired
                  ? "border-destructive/40 bg-destructive/5"
                  : isConnected
                    ? "border-border bg-background"
                    : "border-border/50 bg-muted/30",
              )}
            >
              <div className="flex items-start gap-2.5">
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
                  {hasError || expired ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : isConnected ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: cal.color }}
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {cal.label}
                    </span>
                  </div>

                  {/* Account email */}
                  {conn?.account_email && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {conn.account_email}
                    </span>
                  )}

                  {/* Status line */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {isConnected && !hasError && !expired ? (
                      <>
                        <Wifi className="h-3 w-3 shrink-0 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {!conn ? "Not connected" : expired ? "Token expired" : "Disconnected"}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Last synced */}
                  {isConnected && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">Last synced: {formatRelativeTime(conn?.last_synced_at ?? null)}</span>
                    </div>
                  )}

                  {/* Error message */}
                  {hasError && (
                    <div
                      className="mt-1 truncate rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
                      title={conn!.sync_error ?? ""}
                    >
                      {shortenSyncError(conn!.sync_error)}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons — always visible below content */}
              <div className="mt-2.5 flex items-center justify-end gap-2">
                {/* When connected and healthy: Sync Now + Disconnect */}
                {isConnected && !needsReconnect && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={() => onDisconnect(cal.id)}
                      title="Disconnect this calendar"
                    >
                      <LogOut className="h-3 w-3" />
                      Disconnect
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[11px]"
                      disabled={isSyncingThis || isSyncing}
                      onClick={() => handleSync(cal.id)}
                    >
                      <RefreshCw className={cn("h-3 w-3", isSyncingThis && "animate-spin")} />
                      {isSyncingThis ? "Syncing…" : "Sync Now"}
                    </Button>
                  </>
                )}

                {/* When disconnected/expired/error: Reconnect */}
                {needsReconnect && (
                  <div className="flex items-center gap-2">
                    {/* Show disconnect even when errored so user can cleanly remove it */}
                    {conn && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                        onClick={() => onDisconnect(cal.id)}
                        title="Disconnect this calendar"
                      >
                        <LogOut className="h-3 w-3" />
                        Disconnect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={hasError || expired ? "destructive" : "default"}
                      className="h-7 text-[11px]"
                      onClick={() => onReconnect(cal.id)}
                    >
                      {!conn ? "Connect" : "Reconnect"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <p className="mt-3 text-[10px] text-muted-foreground">
        Events from all connected calendars sync automatically every 5 minutes.
        Any event on Google or Outlook will appear here and block that time across all calendars.
      </p>
    </div>
  );
}
