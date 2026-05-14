import { AppLayout } from "@/components/layout/app-layout";
import { getMyIncomeHistory, useGetMyIncomeHistory } from "@workspace/api-client-react";
import { Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Button, Input, Label } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { IncomeHistoryEntry } from "@workspace/api-client-react";
import { IncomeHistoryEntryType } from "@workspace/api-client-react";
import { toast } from "sonner";

function formatStatusType(t: string, row?: IncomeHistoryEntry) {
  if (t === "ROI") return "ROI";
  if (t === "ADJUSTMENT") {
    if (row?.investmentId === "__deposit__" || (row?.note && String(row.note).includes("Wallet deposit")))
      return "Deposit";
    return "Adjustment";
  }
  if (t === IncomeHistoryEntryType.WITHDRAWAL) return "Withdrawal";
  return t;
}

export default function IncomeHistory() {
  const [items, setItems] = useState<IncomeHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading, isFetching, isError, error, refetch } = useGetMyIncomeHistory({ limit: 25 });

  useEffect(() => {
    if (isError) {
      setItems([]);
      setNextCursor(null);
      return;
    }
    if (!data) return;
    setItems(data.items ?? []);
    setNextCursor(data.nextCursor ?? null);
  }, [data, isError]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    try {
      const more = await getMyIncomeHistory({ limit: 25, cursor: nextCursor });
      setItems((prev) => [...prev, ...more.items]);
      setNextCursor(more.nextCursor);
    } catch {
      toast.error("Could not load more history.");
    }
  }, [nextCursor]);

  const filtered = useMemo(() => {
    if (!fromDate && !toDate) return items;
    const from = fromDate ? new Date(fromDate).setHours(0, 0, 0, 0) : null;
    const to = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : null;
    return items.filter((row) => {
      const d = new Date(row.date).getTime();
      if (from !== null && d < from) return false;
      if (to !== null && d > to) return false;
      return true;
    });
  }, [items, fromDate, toDate]);

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
  };

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold">Income History</h2>
          <p className="text-muted-foreground">Track your investments, daily ROI, deposits, withdrawals, and admin adjustments</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Clear
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading history…</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan/Details</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(row.date)}
                    </TableCell>
                    <TableCell>
                      {row.type === IncomeHistoryEntryType.WITHDRAWAL ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Withdrawal Request</div>
                          <div className="text-xs text-muted-foreground">
                            Fee: {formatINR(row.feeAmount ?? 0)} · Net: {formatINR(row.netAmount ?? 0)}
                          </div>
                        </div>
                      ) : row.investmentId === "__deposit__" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Wallet Top-up</div>
                          <div className="text-xs text-emerald-600">Instantly added to wallet</div>
                        </div>
                      ) : row.type === IncomeHistoryEntryType.INVESTMENT ? (
                        <div className="space-y-1">
                          <div className="font-medium">{row.planName || "Unknown Plan"}</div>
                          <div className="text-xs text-rose-600 font-semibold">Plan Activated</div>
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
                      {row.type === IncomeHistoryEntryType.WITHDRAWAL || row.investmentId === "__deposit__"
                        ? <span className="text-muted-foreground text-sm">—</span>
                        : <span className="font-mono text-sm">{row.dayNumber}</span>}
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
                            : formatStatusType(row.type, row)}
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
                          <span className="text-xs text-amber-400">Admin adjustment</span>
                        )
                      ) : (
                        <span className="text-xs text-emerald-400">Daily ROI credited</span>
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
                    <TableCell className="text-sm text-muted-foreground max-w-[14rem] truncate">
                      {row.type === IncomeHistoryEntryType.WITHDRAWAL && row.feeAmount != null && row.netAmount != null
                        ? `Gross: ${formatINR(Math.abs(row.amount) + (row.feeAmount ?? 0))} · Fee ${formatINR(row.feeAmount)} · Net ${formatINR(row.netAmount)}`
                        : row.note || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                      {fromDate || toDate
                        ? "No entries match your date filters."
                        : items.length === 0
                          ? "No income recorded yet. ROI credits appear here after each weekday run (when you have active investments)."
                          : "No entries match your filters."}
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
