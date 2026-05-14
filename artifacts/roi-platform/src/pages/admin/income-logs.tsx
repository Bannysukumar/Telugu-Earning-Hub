import { AppLayout } from "@/components/layout/app-layout";
import {
  adminGetIncomeHistory,
  useAdminGetIncomeHistory,
  useAdminGetUsers,
} from "@workspace/api-client-react";
import { Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Button, Input, Label } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import type { IncomeHistoryEntry } from "@workspace/api-client-react";
import { IncomeHistoryEntryType } from "@workspace/api-client-react";
import { toast } from "sonner";

export default function AdminIncomeLogs() {
  const { data: allUsers } = useAdminGetUsers();
  const [userIdFilter, setUserIdFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [appliedUserId, setAppliedUserId] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<IncomeHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useAdminGetIncomeHistory({
    limit: 30,
    userId: appliedUserId,
  });

  useEffect(() => {
    if (!data) return;
    setItems(data.items);
    setNextCursor(data.nextCursor);
  }, [data]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    try {
      const more = await adminGetIncomeHistory({
        limit: 30,
        userId: appliedUserId,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...more.items]);
      setNextCursor(more.nextCursor);
    } catch {
      toast.error("Could not load more.");
    }
  }, [nextCursor, appliedUserId]);

  const applyFilter = () => {
    const uid = userIdFilter.trim();
    const email = emailFilter.trim().toLowerCase();

    if (uid) {
      setAppliedUserId(uid);
      return;
    }

    if (email) {
      const matches = (allUsers ?? []).filter((u) => u.email.toLowerCase().includes(email));
      if (matches.length === 0) {
        toast.error("No user found with that email.");
        setAppliedUserId(undefined);
        return;
      }
      if (matches.length > 1) {
        toast.info(`${matches.length} users match — showing the first. Refine email or use User ID.`, {
          description: matches
            .slice(0, 3)
            .map((u) => u.email)
            .join(", "),
        });
      }
      setAppliedUserId(matches[0]!.id);
      return;
    }

    setAppliedUserId(undefined);
  };

  const clearFilters = () => {
    setUserIdFilter("");
    setEmailFilter("");
    setAppliedUserId(undefined);
  };

  return (
    <AppLayout isAdmin>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold">Income Logs</h2>
          <p className="text-muted-foreground">All investments, ROI credits, withdrawals, deposits, and admin adjustments across the platform</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 min-w-[12rem]">
            <Label className="text-xs">Search by email</Label>
            <Input
              type="search"
              placeholder="user@example.com"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
            />
          </div>
          <div className="space-y-1 min-w-[12rem]">
            <Label className="text-xs">Or user ID</Label>
            <Input
              placeholder="Firebase uid"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
            />
          </div>
          <Button type="button" onClick={applyFilter}>
            Apply
          </Button>
          <Button type="button" variant="outline" onClick={clearFilters}>
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Plan/Details</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(row.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{row.userId}</TableCell>
                    <TableCell>
                      {row.type === IncomeHistoryEntryType.WITHDRAWAL ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Withdrawal Request</div>
                          <div className="text-xs text-muted-foreground">
                            Fee: {formatINR(row.feeAmount ?? 0)}
                          </div>
                        </div>
                      ) : row.investmentId === "__deposit__" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Wallet Deposit</div>
                          <div className="text-xs text-muted-foreground">Added to wallet balance</div>
                        </div>
                      ) : row.type === IncomeHistoryEntryType.INVESTMENT ? (
                        <div className="space-y-1">
                          <div className="font-medium">{row.planName || "Unknown Plan"}</div>
                          <div className="text-xs text-rose-600 font-semibold">Investment Activated</div>
                          <div className="text-xs text-muted-foreground">Principal: {formatINR(row.planAmount)}</div>
                          {row.note && (
                            <div className="text-xs text-amber-600 truncate max-w-[200px]" title={row.note}>
                              {row.note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium">{row.planName || "Unknown Plan"}</div>
                          <div className="text-xs text-muted-foreground">Principal: {formatINR(row.planAmount)}</div>
                          {row.note && (
                            <div className="text-xs text-amber-600 truncate max-w-[200px]" title={row.note}>
                              {row.note}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.type === IncomeHistoryEntryType.WITHDRAWAL || row.investmentId === "__deposit__" ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <span className="font-mono text-sm">{row.dayNumber}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                          row.type === IncomeHistoryEntryType.INVESTMENT
                            ? "bg-rose-500/10 text-rose-400"
                            : row.type === "ADJUSTMENT"
                              ? row.investmentId === "__deposit__"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                              : row.type === IncomeHistoryEntryType.WITHDRAWAL
                                ? "bg-rose-500/10 text-rose-400"
                                : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {row.type === IncomeHistoryEntryType.INVESTMENT
                          ? "INVESTMENT"
                          : row.type === "ADJUSTMENT" && row.investmentId === "__deposit__"
                            ? "DEPOSIT"
                            : row.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.type === IncomeHistoryEntryType.INVESTMENT ? (
                        <span className="text-xs text-rose-400">Deducted from wallet</span>
                      ) : row.type === IncomeHistoryEntryType.WITHDRAWAL ? (
                        <span className="text-xs text-rose-400">Deducted from wallet</span>
                      ) : row.type === "ADJUSTMENT" ? (
                        row.investmentId === "__deposit__" ? (
                          <span className="text-xs text-emerald-400">Added to wallet</span>
                        ) : (
                          <span className="text-xs text-amber-400">Manual adjustment</span>
                        )
                      ) : (
                        <span className="text-xs text-emerald-400">ROI credited</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${
                        row.type === IncomeHistoryEntryType.WITHDRAWAL
                          ? "text-rose-400"
                          : row.type === "ADJUSTMENT"
                            ? row.investmentId === "__deposit__"
                              ? "text-emerald-400"
                              : "text-amber-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {row.amount < 0 ? "−" : "+"}
                      {formatINR(Math.abs(row.amount))}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                      No income entries yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            {nextCursor ? (
              <div className="p-4 border-t border-border flex justify-center">
                <Button variant="outline" onClick={() => void loadMore()} disabled={isFetching}>
                  {isFetching ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </AppLayout>
  );
}
