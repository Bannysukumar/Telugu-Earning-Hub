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

const PEER_TRANSFER_ID = "__peer_transfer__";

function isPeerTransfer(row: IncomeHistoryEntry) {
  return row.investmentId === PEER_TRANSFER_ID;
}

function isGiftPlanPlatformFee(row: IncomeHistoryEntry) {
  const n = row.note ?? "";
  return row.type === IncomeHistoryEntryType.ADJUSTMENT && n.includes("Gift plan platform fee");
}

function isGiftPlanPayerDebit(row: IncomeHistoryEntry) {
  const n = row.note ?? "";
  return row.type === IncomeHistoryEntryType.ADJUSTMENT && n.includes("Wallet: sponsored plan activation");
}

function isGiftPlanBeneficiary(row: IncomeHistoryEntry) {
  const n = row.note ?? "";
  return row.type === IncomeHistoryEntryType.INVESTMENT && n.includes("Plan activated (sponsored)");
}

function classifyIncomeRow(
  row: IncomeHistoryEntry,
):
  | "withdrawal"
  | "deposit"
  | "peer_transfer"
  | "gift_fee"
  | "gift_payer"
  | "gift_received"
  | "investment"
  | "referral_or_binary"
  | "adjustment"
  | "roi" {
  if (row.type === IncomeHistoryEntryType.WITHDRAWAL) return "withdrawal";
  if (row.investmentId === "__deposit__") return "deposit";
  if (isPeerTransfer(row)) return "peer_transfer";
  if (isGiftPlanPlatformFee(row)) return "gift_fee";
  if (isGiftPlanPayerDebit(row)) return "gift_payer";
  if (isGiftPlanBeneficiary(row)) return "gift_received";
  if (row.type === IncomeHistoryEntryType.INVESTMENT) return "investment";
  if (
    row.type === IncomeHistoryEntryType.REFERRAL_BONUS ||
    row.type === IncomeHistoryEntryType.BINARY_PAIR ||
    row.type === IncomeHistoryEntryType.LEVEL_INCOME
  ) {
    return "referral_or_binary";
  }
  if (row.type === IncomeHistoryEntryType.ADJUSTMENT) return "adjustment";
  return "roi";
}

function mlmIncomeTitle(type: IncomeHistoryEntry["type"]) {
  if (type === IncomeHistoryEntryType.REFERRAL_BONUS) return "Direct referral bonus";
  if (type === IncomeHistoryEntryType.LEVEL_INCOME) return "Level income";
  return "Binary pair income";
}

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
          <p className="text-muted-foreground max-w-3xl">
            Platform-wide ledger: ROI, referrals, binary, withdrawals, deposits,{" "}
            <strong>send-funds (peer transfers)</strong>, <strong>gift-a-plan</strong> (sponsor payments, fees, and
            beneficiary activations), and other adjustments. Filter by user to audit one account.
          </p>
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
                {items.map((row) => {
                  const kind = classifyIncomeRow(row);
                  return (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(row.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{row.userId}</TableCell>
                    <TableCell>
                      {kind === "withdrawal" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Withdrawal Request</div>
                          <div className="text-xs text-muted-foreground">
                            Fee: {formatINR(row.feeAmount ?? 0)}
                          </div>
                        </div>
                      ) : kind === "deposit" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Wallet Deposit</div>
                          <div className="text-xs text-muted-foreground">Added to wallet balance</div>
                        </div>
                      ) : kind === "peer_transfer" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-cyan-400">Send funds · peer transfer</div>
                          <div className="text-xs text-muted-foreground">
                            {row.amount < 0 ? "Sender row (wallet debited gross)" : "Recipient row (net credited)"}
                          </div>
                          {row.feeAmount != null && row.feeAmount > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Fee retained: {formatINR(row.feeAmount)}
                              {row.netAmount != null ? ` · Net to peer: ${formatINR(row.netAmount)}` : null}
                            </div>
                          ) : null}
                          {row.note ? (
                            <div className="text-xs text-amber-600/90 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          ) : null}
                        </div>
                      ) : kind === "gift_fee" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-fuchsia-400">Gift a plan · platform fee</div>
                          <div className="text-xs text-muted-foreground">Charged to sponsor on top of plan price</div>
                          {row.planName ? (
                            <div className="text-xs text-muted-foreground">Plan: {row.planName}</div>
                          ) : null}
                          {row.note ? (
                            <div className="text-xs text-amber-600/90 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          ) : null}
                        </div>
                      ) : kind === "gift_payer" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-fuchsia-400">Gift a plan · sponsor payment</div>
                          <div className="text-xs text-muted-foreground">Another member&apos;s plan activated from this wallet</div>
                          {row.planName ? (
                            <div className="text-xs text-muted-foreground">Plan: {row.planName}</div>
                          ) : null}
                          {row.note ? (
                            <div className="text-xs text-amber-600/90 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          ) : null}
                        </div>
                      ) : kind === "gift_received" ? (
                        <div className="space-y-1">
                          <div className="font-medium text-fuchsia-300">{row.planName || "Plan package"}</div>
                          <div className="text-xs font-semibold text-fuchsia-400/90">Gift a plan · received (sponsored)</div>
                          <div className="text-xs text-muted-foreground">Principal on account: {formatINR(row.planAmount)}</div>
                          {row.note ? (
                            <div className="text-xs text-amber-600/90 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          ) : null}
                        </div>
                      ) : kind === "investment" ? (
                        <div className="space-y-1">
                          <div className="font-medium">{row.planName || "Unknown Plan"}</div>
                          <div className="text-xs text-rose-600 font-semibold">Investment Activated</div>
                          <div className="text-xs text-muted-foreground">Principal: {formatINR(row.planAmount)}</div>
                          {row.note && (
                            <div className="text-xs text-amber-600 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          )}
                        </div>
                      ) : kind === "referral_or_binary" ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {mlmIncomeTitle(row.type)}
                          </div>
                          <div className="text-xs text-muted-foreground">{row.planName || "MLM credit"}</div>
                          {row.note && (
                            <div className="text-xs text-amber-600 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium">{row.planName || "Unknown Plan"}</div>
                          <div className="text-xs text-muted-foreground">Principal: {formatINR(row.planAmount)}</div>
                          {row.note && (
                            <div className="text-xs text-amber-600 max-w-md whitespace-pre-wrap break-words" title={row.note}>
                              {row.note}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {kind === "withdrawal" ||
                      kind === "deposit" ||
                      kind === "peer_transfer" ||
                      kind === "gift_fee" ||
                      kind === "gift_payer" ||
                      kind === "gift_received" ||
                      kind === "referral_or_binary" ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <span className="font-mono text-sm">{row.dayNumber}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                          kind === "investment"
                            ? "bg-rose-500/10 text-rose-400"
                            : kind === "gift_received"
                              ? "bg-fuchsia-500/15 text-fuchsia-300"
                              : kind === "gift_payer" || kind === "gift_fee"
                                ? "bg-fuchsia-500/10 text-fuchsia-400"
                                : kind === "peer_transfer"
                                  ? "bg-cyan-500/10 text-cyan-400"
                                  : kind === "referral_or_binary"
                                    ? row.type === IncomeHistoryEntryType.REFERRAL_BONUS
                                      ? "bg-sky-500/10 text-sky-400"
                                      : row.type === IncomeHistoryEntryType.LEVEL_INCOME
                                        ? "bg-indigo-500/10 text-indigo-400"
                                        : "bg-violet-500/10 text-violet-400"
                                    : kind === "adjustment"
                                      ? row.investmentId === "__deposit__"
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-amber-500/10 text-amber-400"
                                      : kind === "withdrawal"
                                        ? "bg-rose-500/10 text-rose-400"
                                        : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {kind === "peer_transfer"
                          ? "PEER_TRANSFER"
                          : kind === "gift_received"
                            ? "GIFT_RECEIVED"
                            : kind === "gift_payer"
                              ? "GIFT_PAID"
                              : kind === "gift_fee"
                                ? "GIFT_FEE"
                                : kind === "investment"
                                  ? "INVESTMENT"
                                  : kind === "deposit"
                                    ? "DEPOSIT"
                                    : row.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      {kind === "investment" ? (
                        <span className="text-xs text-rose-400">Deducted from wallet</span>
                      ) : kind === "gift_received" ? (
                        <span className="text-xs text-fuchsia-300">Sponsored activation (no wallet debit)</span>
                      ) : kind === "gift_payer" ? (
                        <span className="text-xs text-fuchsia-400">Wallet debited (gift)</span>
                      ) : kind === "gift_fee" ? (
                        <span className="text-xs text-fuchsia-400">Wallet debited (gift fee)</span>
                      ) : kind === "peer_transfer" ? (
                        row.amount < 0 ? (
                          <span className="text-xs text-cyan-400">Wallet debited (sent)</span>
                        ) : (
                          <span className="text-xs text-cyan-400">Wallet credited (received)</span>
                        )
                      ) : kind === "withdrawal" ? (
                        <span className="text-xs text-rose-400">Deducted from wallet</span>
                      ) : kind === "referral_or_binary" ? (
                        <span className="text-xs text-emerald-400">Credited to wallet & plan cap</span>
                      ) : kind === "adjustment" ? (
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
                        kind === "withdrawal" || kind === "gift_payer" || kind === "gift_fee"
                          ? "text-rose-400"
                          : kind === "peer_transfer"
                            ? row.amount < 0
                              ? "text-rose-400"
                              : "text-emerald-400"
                            : kind === "investment"
                              ? row.amount < 0
                                ? "text-rose-400"
                                : "text-emerald-400"
                              : kind === "referral_or_binary" || kind === "gift_received"
                                ? "text-emerald-400"
                                : kind === "adjustment"
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
                  );
                })}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center p-8 text-muted-foreground">
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
