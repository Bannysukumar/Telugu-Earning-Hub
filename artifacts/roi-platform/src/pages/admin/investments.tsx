import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetInvestments,
  useAdminPatchInvestment,
  useAdminCreateInvestment,
  useAdminGetUsers,
  useAdminGetPlans,
} from "@workspace/api-client-react";
import type { AdminInvestment, AdminUser } from "@workspace/api-client-react";
import { Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Button, Input, Label } from "@/components/ui/core";
import { formatINR, formatDate, cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminActivateGrowthPlan,
  getAdminGrowthSettings,
  type GrowthAdminSettings,
} from "@/lib/growth-plan-api";

const INVESTMENTS_QUERY_PREFIX = "/api/admin/investments" as const;
const USERS_QUERY_PREFIX = "/api/admin/users" as const;
const PAGE_SIZE = 25;
const SMART_GROWTH_PLAN_ID = "__smart_growth__";

type AdminUserWithGrowth = AdminUser & {
  growthPlanStatus?: string;
  growthRemainingDays?: number;
};

function statusLabel(s: string) {
  if (s === "manually_stopped") return "Manual stop";
  if (s === "completed") return "Completed";
  return "Active";
}

function growthStatusLabel(status?: string) {
  if (status === "active") return "Active";
  if (status === "completed") return "Completed";
  if (status === "expired") return "Expired";
  return "Pending";
}

export default function AdminInvestments() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "active" | "completed">("all");
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [createUserId, setCreateUserId] = useState<string>("");
  const [createPlanId, setCreatePlanId] = useState<string>("");
  const [userPickQuery, setUserPickQuery] = useState("");
  const [isActivatingGrowth, setIsActivatingGrowth] = useState(false);
  const [growthSettings, setGrowthSettings] = useState<GrowthAdminSettings | null>(null);

  const [detailsInv, setDetailsInv] = useState<AdminInvestment | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getAdminGrowthSettings();
        if (!cancelled) setGrowthSettings(s);
      } catch {
        if (!cancelled) setGrowthSettings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status, filterUserId, debouncedSearch]);

  const listParams = useMemo(
    () => ({
      status,
      userId: filterUserId || undefined,
      search: debouncedSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [status, filterUserId, debouncedSearch, page],
  );

  const { data: listData, isLoading } = useAdminGetInvestments(listParams);
  const { data: usersRaw = [], isLoading: usersLoading } = useAdminGetUsers();
  const { data: plans = [], isLoading: plansLoading } = useAdminGetPlans();
  const users = usersRaw as AdminUserWithGrowth[];

  const { mutate: patchInvestment, isPending: isPatching } = useAdminPatchInvestment();
  const { mutate: createInvestment, isPending: isCreating } = useAdminCreateInvestment();

  const invalidateInvestments = useCallback(() => {
    void qc.invalidateQueries({ queryKey: [INVESTMENTS_QUERY_PREFIX] });
  }, [qc]);

  const invalidateUsers = useCallback(() => {
    void qc.invalidateQueries({ queryKey: [USERS_QUERY_PREFIX] });
  }, [qc]);

  const investments = listData?.items ?? [];
  const totalPages = listData?.totalPages ?? 1;
  const total = listData?.total ?? 0;

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);

  const filteredUsersForPicker = useMemo(() => {
    const q = userPickQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q),
    );
  }, [users, userPickQuery]);

  const selectedCreateUser = users.find((u) => u.id === createUserId);
  const selectedGrowthStatus = selectedCreateUser?.growthPlanStatus ?? "pending";
  const selectedHasActiveGrowth = selectedGrowthStatus === "active";
  const selectingSmartGrowth = createPlanId === SMART_GROWTH_PLAN_ID;
  const smartGrowthBlocked = selectingSmartGrowth && selectedHasActiveGrowth;

  useEffect(() => {
    if (createPlanId === SMART_GROWTH_PLAN_ID && selectedHasActiveGrowth) {
      setCreatePlanId("");
    }
  }, [createUserId, selectedHasActiveGrowth, createPlanId]);

  const onActivatePlan = () => {
    if (!createUserId || !createPlanId) {
      toast.error("Select a user and an active plan.");
      return;
    }

    if (createPlanId === SMART_GROWTH_PLAN_ID) {
      if (selectedHasActiveGrowth) {
        toast.error(
          `${selectedCreateUser?.name ?? "This user"} already has an active Smart Growth Plan` +
            (selectedCreateUser?.growthRemainingDays
              ? ` (${selectedCreateUser.growthRemainingDays} days left).`
              : "."),
        );
        return;
      }
      setIsActivatingGrowth(true);
      void adminActivateGrowthPlan(createUserId, false)
        .then((res) => {
          toast.success(
            `Smart Growth activated (cycle ${res.cycleNumber}). Wallet was not deducted.`,
          );
          setCreatePlanId("");
          invalidateUsers();
        })
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Could not activate Smart Growth"),
        )
        .finally(() => setIsActivatingGrowth(false));
      return;
    }

    createInvestment(
      { data: { userId: createUserId, planId: createPlanId } },
      {
        onSuccess: () => {
          toast.success("Investment created for user.");
          setCreatePlanId("");
          invalidateInvestments();
        },
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Could not create investment"),
      },
    );
  };

  const activateBusy = isCreating || isActivatingGrowth;
  const growthPlanOptionActive = growthSettings?.planStatus === "active";

  return (
    <AppLayout isAdmin>
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-3xl font-display font-bold">Investments</h2>
          <p className="text-muted-foreground">
            Create plans for any user, multiple concurrent investments per user, manual activate/deactivate per row.
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Activate plan for user</h3>
          <p className="text-sm text-muted-foreground">
            Creates a new investment (separate from any existing). Max return is set to 2× plan principal; ROI tracks
            independently. Smart Growth ₹200 can also be activated here (no wallet debit, same as other admin gifts).
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>User</Label>
              <Input
                placeholder="Search name, email, or user id…"
                value={userPickQuery}
                onChange={(e) => setUserPickQuery(e.target.value)}
                className="mb-2"
              />
              <Select
                value={createUserId}
                onValueChange={setCreateUserId}
                disabled={usersLoading}
              >
                <SelectTrigger className="h-12 rounded-xl border-border bg-background/50">
                  <SelectValue placeholder={usersLoading ? "Loading users…" : "Choose user"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {filteredUsersForPicker.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="font-medium">{u.name}</span>
                      <span className="text-muted-foreground text-xs block truncate max-w-[280px]">
                        {u.email} · {u.id}
                      </span>
                    </SelectItem>
                  ))}
                  {filteredUsersForPicker.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">No users match.</div>
                  ) : null}
                </SelectContent>
              </Select>
              {selectedCreateUser ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-mono break-all">ID: {selectedCreateUser.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Smart Growth:{" "}
                    <span className="font-medium text-foreground">
                      {growthStatusLabel(selectedGrowthStatus)}
                    </span>
                    {selectedHasActiveGrowth
                      ? ` · ${selectedCreateUser.growthRemainingDays ?? 0} days left`
                      : null}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Active plan</Label>
              <Select
                value={createPlanId}
                onValueChange={setCreatePlanId}
                disabled={plansLoading}
              >
                <SelectTrigger className="h-12 rounded-xl border-border bg-background/50">
                  <SelectValue placeholder={plansLoading ? "Loading plans…" : "Choose plan"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {growthPlanOptionActive && growthSettings ? (
                    <SelectItem value={SMART_GROWTH_PLAN_ID} disabled={selectedHasActiveGrowth}>
                      <span className="font-medium">{growthSettings.planName}</span>
                      <span className="text-xs text-muted-foreground block">
                        {formatINR(growthSettings.planAmount)} · {formatINR(growthSettings.dailyRoi)}/day · Smart Growth
                        {selectedHasActiveGrowth ? " · already active for this user" : ""}
                      </span>
                    </SelectItem>
                  ) : null}
                  {activePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground block">
                        {formatINR(p.amount)} · {formatINR(p.dailyRoi)}/day
                      </span>
                    </SelectItem>
                  ))}
                  {!growthPlanOptionActive && activePlans.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">No active plans.</div>
                  ) : null}
                </SelectContent>
              </Select>
              {smartGrowthBlocked ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This user already has an active Smart Growth Plan. Pick a pending user (e.g. Platform Admin or
                  adepu sukumar), or wait until the current cycle completes.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            onClick={onActivatePlan}
            disabled={activateBusy || !createUserId || !createPlanId || smartGrowthBlocked}
            isLoading={activateBusy}
            className="w-full sm:w-auto"
          >
            Activate plan
          </Button>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {(["all", "active", "completed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={status === s ? "default" : "outline"}
                  onClick={() => setStatus(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0">
              <div className="space-y-1 flex-1 min-w-[12rem]">
                <Label className="text-xs">Filter by user</Label>
                <Select
                  value={filterUserId || "__all__"}
                  onValueChange={(v) => setFilterUserId(v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__all__">All users</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} — {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1 min-w-[12rem]">
                <Label className="text-xs">Search email / user id</Label>
                <Input
                  className="h-10 rounded-xl"
                  placeholder="Type to filter…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {investments.length} of {total} (page {page} / {totalPages})
          </p>
        </Card>

        <Card>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading investments...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan amount</TableHead>
                    <TableHead>Daily ROI</TableHead>
                    <TableHead>Total earned</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv) => {
                    const onManual = (manualStatus: "active" | "inactive") => {
                      patchInvestment(
                        { investmentId: inv.id, data: { manualStatus } },
                        {
                          onSuccess: () => {
                            toast.success(
                              manualStatus === "active"
                                ? "Investment activated (manual)"
                                : "Investment paused (manual)",
                            );
                            invalidateInvestments();
                          },
                          onError: (err: unknown) =>
                            toast.error(err instanceof Error ? err.message : "Update failed"),
                        },
                      );
                    };
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="font-medium">{inv.userName}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{inv.userEmail}</div>
                        </TableCell>
                        <TableCell className="font-bold">{formatINR(inv.amount)}</TableCell>
                        <TableCell className="text-emerald-400">{formatINR(inv.dailyRoi)}</TableCell>
                        <TableCell>
                          <div className="text-emerald-400 font-medium">{formatINR(inv.totalEarned)}</div>
                          <div className="text-xs text-muted-foreground">cap {formatINR(inv.maxReturn)}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {inv.daysCompleted}/{inv.maxDays}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={inv.isActive ? "success" : "default"}>{statusLabel(inv.status)}</Badge>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              Sys {inv.systemActive ? "on" : "off"} · Manual {inv.manualStatus}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(inv.startDate).split(",")[0]}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPatching || inv.manualStatus === "active"}
                                className="text-xs h-8"
                                onClick={() => onManual("active")}
                              >
                                Activate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPatching || inv.manualStatus === "inactive"}
                                className="text-xs h-8"
                                onClick={() => onManual("inactive")}
                              >
                                Deactivate
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-8 justify-start px-2"
                              onClick={() => setDetailsInv(inv)}
                            >
                              View details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {investments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center p-8 text-muted-foreground">
                        No investments match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Dialog open={!!detailsInv} onOpenChange={(o) => !o && setDetailsInv(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Investment details</DialogTitle>
          </DialogHeader>
          {detailsInv ? (
            <div className="space-y-3 text-sm">
              <DetailRow label="Investment ID" value={detailsInv.id} mono />
              <DetailRow label="User ID" value={detailsInv.userId} mono />
              <DetailRow label="User" value={`${detailsInv.userName} (${detailsInv.userEmail})`} />
              <DetailRow label="Plan" value={`${detailsInv.planName} (${detailsInv.planId})`} />
              <DetailRow label="Principal" value={formatINR(detailsInv.amount)} />
              <DetailRow label="Daily ROI" value={formatINR(detailsInv.dailyRoi)} />
              <DetailRow label="Max return (2× cap)" value={formatINR(detailsInv.maxReturn)} />
              <DetailRow label="Total earned" value={formatINR(detailsInv.totalEarned)} />
              <DetailRow label="Days" value={`${detailsInv.daysCompleted} / ${detailsInv.maxDays}`} />
              <DetailRow label="Status" value={statusLabel(detailsInv.status)} />
              <DetailRow
                label="Flags"
                value={`systemActive=${detailsInv.systemActive}, manualStatus=${detailsInv.manualStatus}, isActive=${detailsInv.isActive}`}
              />
              <DetailRow label="Started" value={formatDate(detailsInv.startDate)} />
              <DetailRow
                label="Last ROI"
                value={detailsInv.lastRoiUpdate ? formatDate(detailsInv.lastRoiUpdate) : "—"}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsInv(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && "font-mono text-xs break-all")}>{value}</span>
    </div>
  );
}
