import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType, FormEvent } from "react";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarDays,
  CreditCard,
  MailPlus,
  Plug,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminClearSyncState,
  adminDeactivateUser,
  adminDeleteUser,
  adminInviteUser,
  adminSetUserPlan,
  adminSyncUser,
  getAdminDashboard,
} from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Jey Link" },
      { name: "description", content: "Admin operations for Jey Link users and platform sync." },
    ],
  }),
  component: AdminPage,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function statusVariant(status: string | null | undefined, hasError: boolean, expired: boolean) {
  if (hasError || expired || status === "error" || status === "disconnected") return "destructive";
  if (status === "connected") return "secondary";
  return "outline";
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
        </div>
        <Icon className="h-5 w-5 text-accent" />
      </div>
    </div>
  );
}

function AdminPage() {
  const qc = useQueryClient();
  const fetchDashboard = useServerFn(getAdminDashboard);
  const syncUserFn = useServerFn(adminSyncUser);
  const clearSyncFn = useServerFn(adminClearSyncState);
  const deactivateUserFn = useServerFn(adminDeactivateUser);
  const deleteUserFn = useServerFn(adminDeleteUser);
  const inviteUserFn = useServerFn(adminInviteUser);
  const setPlanFn = useServerFn(adminSetUserPlan);

  const [q, setQ] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetchDashboard(),
  });

  const users = useMemo(() => data?.users ?? [], [data?.users]);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;

  const filteredUsers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [user.displayName, user.email, user.businessName, user.plan]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(needle)),
    );
  }, [q, users]);

  const refreshAdmin = () => qc.invalidateQueries({ queryKey: ["admin-dashboard"] });

  const inviteUser = useMutation({
    mutationFn: (email: string) => inviteUserFn({ data: { email } }),
    onSuccess: (result) => {
      setInviteEmail("");
      refreshAdmin();
      toast.success("Invite sent", { description: result.email });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitInvite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    inviteUser.mutate(email);
  };

  const syncUser = useMutation({
    mutationFn: (userId: string) => syncUserFn({ data: { userId } }),
    onSuccess: (result) => {
      refreshAdmin();
      const failures = result.results.filter((row) => !row.ok);
      if (failures.length) {
        toast.warning("Sync finished with errors", {
          description: failures.map((row) => `${row.platform}: ${row.error}`).join(" · "),
        });
      } else {
        toast.success("User sync completed");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const clearSync = useMutation({
    mutationFn: (userId: string) => clearSyncFn({ data: { userId } }),
    onSuccess: () => {
      refreshAdmin();
      toast.success("Sync state cleared");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateUser = useMutation({
    mutationFn: (vars: { userId: string; deactivate: boolean }) => deactivateUserFn({ data: vars }),
    onSuccess: () => {
      refreshAdmin();
      toast.success("User status updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) => deleteUserFn({ data: { userId } }),
    onSuccess: () => {
      setSelectedUserId(null);
      refreshAdmin();
      toast.success("User deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setPlan = useMutation({
    mutationFn: (vars: { userId: string; plan: "free" | "paid" | "trial" | "internal" }) =>
      setPlanFn({ data: vars }),
    onSuccess: () => {
      refreshAdmin();
      toast.success("Plan updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <h1 className="text-lg font-semibold text-foreground">Admin unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <Shield className="h-4 w-4" />
            Admin backend
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Jey Link Operations</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={submitInvite} className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite by email"
              className="w-full sm:w-64"
              disabled={inviteUser.isPending}
            />
            <Button type="submit" disabled={inviteUser.isPending || !inviteEmail.trim()}>
              <MailPlus className="h-4 w-4" />
              {inviteUser.isPending ? "Sending..." : "Invite"}
            </Button>
          </form>
          <Button onClick={() => refreshAdmin()} disabled={isLoading} variant="outline">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Users" value={data?.stats.totalUsers ?? 0} icon={Users} />
        <StatCard
          label="Appointments"
          value={data?.stats.totalAppointments ?? 0}
          icon={CalendarDays}
        />
        <StatCard label="Upcoming" value={data?.stats.upcomingAppointments ?? 0} icon={Activity} />
        <StatCard label="Conflicts" value={data?.stats.conflictCount ?? 0} icon={AlertTriangle} />
        <StatCard
          label="Broken connections"
          value={data?.stats.brokenConnectionCount ?? 0}
          icon={Plug}
        />
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="google">Google OAuth</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <section className="rounded-lg border bg-card">
            <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">User management</h2>
                <p className="text-xs text-muted-foreground">
                  Signed-up users, plans, connected platforms, sync status, and account actions.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search users"
                  className="pl-9"
                />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Platforms</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <div className="font-medium text-foreground">{user.displayName}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                        {user.bannedUntil ? (
                          <Badge variant="destructive" className="mt-1">
                            deactivated
                          </Badge>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell>{formatDateOnly(user.createdAt)}</TableCell>
                    <TableCell>
                      <select
                        value={user.plan}
                        onChange={(e) =>
                          setPlan.mutate({
                            userId: user.id,
                            plan: e.target.value as "free" | "paid" | "trial" | "internal",
                          })
                        }
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="free">Free</option>
                        <option value="trial">Trial</option>
                        <option value="paid">Paid</option>
                        <option value="internal">Internal</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {user.platforms.length ? (
                          user.platforms.map((platform) => (
                            <Badge
                              key={`${user.id}-${platform.platform}`}
                              variant={statusVariant(
                                platform.status,
                                Boolean(platform.syncError),
                                platform.isExpired,
                              )}
                            >
                              {platform.platform}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(user.lastSyncedAt)}</TableCell>
                    <TableCell>
                      {user.syncErrors.length || user.conflictCount ? (
                        <Badge variant="destructive">
                          {user.syncErrors.length + user.conflictCount}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => syncUser.mutate(user.id)}
                          disabled={syncUser.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            deactivateUser.mutate({
                              userId: user.id,
                              deactivate: !user.bannedUntil,
                            })
                          }
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {user.bannedUntil ? "Reactivate" : "Deactivate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <section className="rounded-lg border bg-card p-3">
            <h2 className="font-semibold text-foreground">Platform health monitor</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <h3 className="text-sm font-medium text-foreground">Connected by platform</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(data?.stats.platformCounts ?? []).map((row) => (
                    <Badge key={row.platform} variant="outline">
                      {row.platform}: {row.count}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <h3 className="text-sm font-medium text-foreground">Broken or expired</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {(data?.health.brokenConnections ?? []).slice(0, 20).map((conn) => (
                    <div
                      key={`${conn.userId}-${conn.platform}`}
                      className="rounded-md bg-muted/40 p-2 text-xs"
                    >
                      <div className="font-medium text-foreground">
                        {conn.displayName} · {conn.platform}
                      </div>
                      <div className="text-muted-foreground">
                        {conn.syncError ??
                          (conn.isExpired
                            ? `Token expired ${conn.expiredForDays ?? "?"} days ago`
                            : conn.status)}
                      </div>
                    </div>
                  ))}
                  {data?.health.brokenConnections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No broken connections found.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <section className="rounded-lg border bg-card p-3">
            <h2 className="font-semibold text-foreground">Appointment overview</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <h3 className="text-sm font-medium text-foreground">By source platform</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(data?.stats.appointmentCounts ?? []).map((row) => (
                    <Badge key={row.platform} variant="outline">
                      {row.platform}: {row.count}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <h3 className="text-sm font-medium text-foreground">Conflict flags by user</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {users
                    .filter((user) => user.conflictCount > 0)
                    .map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className="rounded-md bg-destructive/10 p-2 text-left text-xs text-destructive"
                      >
                        {user.displayName}: {user.conflictCount} conflicting appointment rows
                      </button>
                    ))}
                  {users.every((user) => user.conflictCount === 0) ? (
                    <p className="text-sm text-muted-foreground">No conflicts found.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="google" className="mt-4">
          <section className="rounded-lg border bg-card p-3">
            <h2 className="font-semibold text-foreground">Google OAuth app management</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Google test-user lists still live in Google Cloud Console unless you add a separate
              Google Cloud admin integration. This panel shows who is likely hitting the test-user
              or access-blocked path.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {(data?.health.googleAccessBlocked ?? []).map((conn) => (
                <div key={conn.userId} className="rounded-md border p-3 text-sm">
                  <div className="font-medium text-foreground">{conn.displayName}</div>
                  <div className="text-xs text-muted-foreground">{conn.email}</div>
                  <p className="mt-2 text-xs text-destructive">{conn.syncError}</p>
                </div>
              ))}
              {data?.health.googleAccessBlocked.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Google access-blocked errors found.
                </p>
              ) : null}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="support" className="mt-4">
          <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-lg border bg-card p-3">
              <h2 className="font-semibold text-foreground">Support tools</h2>
              <div className="mt-3 flex max-h-[520px] flex-col gap-2 overflow-auto">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={cn(
                      "rounded-md border p-2 text-left text-sm transition-colors hover:bg-muted/50",
                      selectedUser?.id === user.id && "border-accent bg-accent/10",
                    )}
                  >
                    <div className="font-medium text-foreground">{user.displayName}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3">
              {selectedUser ? (
                <>
                  <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-semibold text-foreground">{selectedUser.displayName}</h2>
                      <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedUser.appointmentCount} appointments · {selectedUser.platformCount}{" "}
                        platforms
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => syncUser.mutate(selectedUser.id)}
                        disabled={syncUser.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Force sync
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => clearSync.mutate(selectedUser.id)}
                        disabled={clearSync.isPending}
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Clear sync state
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (
                            window.confirm(`Delete ${selectedUser.email}? This cannot be undone.`)
                          ) {
                            deleteUser.mutate(selectedUser.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <div>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                        <Plug className="h-4 w-4" />
                        Connections
                      </h3>
                      <div className="flex flex-col gap-2">
                        {selectedUser.platforms.map((platform) => (
                          <div key={platform.platform} className="rounded-md border p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">
                                {platform.platform}
                              </span>
                              <Badge
                                variant={statusVariant(
                                  platform.status,
                                  Boolean(platform.syncError),
                                  platform.isExpired,
                                )}
                              >
                                {platform.status}
                              </Badge>
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              Account: {platform.accountLabel ?? "Unknown"}
                            </div>
                            <div className="text-muted-foreground">
                              Last sync: {formatDate(platform.lastSyncedAt)}
                            </div>
                            {platform.tokenExpiresAt ? (
                              <div className="text-muted-foreground">
                                Token expires: {formatDate(platform.tokenExpiresAt)}
                              </div>
                            ) : null}
                            {platform.syncError ? (
                              <div className="mt-1 text-destructive">{platform.syncError}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                        <CalendarDays className="h-4 w-4" />
                        Recent appointments
                      </h3>
                      <div className="flex max-h-[420px] flex-col gap-2 overflow-auto">
                        {selectedUser.appointments.map((appt) => (
                          <div key={appt.id} className="rounded-md border p-2 text-xs">
                            <div className="font-medium text-foreground">{appt.client_name}</div>
                            <div className="text-muted-foreground">
                              {appt.service ?? "Appointment"} · {appt.source_platform}
                            </div>
                            <div className="text-muted-foreground">
                              {formatDate(appt.starts_at)} - {formatDate(appt.ends_at)}
                            </div>
                          </div>
                        ))}
                        {selectedUser.appointments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No appointments found.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a user to inspect support data.
                </p>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <CreditCard className="mt-0.5 h-3.5 w-3.5" />
        Plan management is stored in Supabase auth app metadata. Monthly sync usage needs a
        dedicated sync-log table before it can show historical counts.
      </p>
    </main>
  );
}
