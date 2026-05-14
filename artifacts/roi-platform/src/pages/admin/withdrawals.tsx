import { AppLayout } from "@/components/layout/app-layout";
import { useAdminGetWithdrawals, useAdminUpdateWithdrawal } from "@workspace/api-client-react";
import { Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Button, Input, Label } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";

export default function AdminWithdrawals() {
  const { data: withdrawals, isLoading } = useAdminGetWithdrawals();
  const [emailSearch, setEmailSearch] = useState("");

  const filteredWithdrawals = useMemo(() => {
    const list = withdrawals ?? [];
    const q = emailSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => w.userEmail.toLowerCase().includes(q));
  }, [withdrawals, emailSearch]);
  const { mutate: updateStatus, isPending } = useAdminUpdateWithdrawal();
  const queryClient = useQueryClient();

  const handleAction = (id: string, status: "approved" | "rejected") => {
    updateStatus(
      { withdrawalId: id, data: { status } },
      {
        onSuccess: () => {
          toast.success(`Withdrawal ${status}`);
          queryClient.invalidateQueries();
        },
        onError: (err: any) => toast.error(err.message),
      },
    );
  };

  return (
    <AppLayout isAdmin>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold">Withdrawal Requests</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {filteredWithdrawals.length === (withdrawals?.length ?? 0)
              ? `${withdrawals?.length ?? 0} total`
              : `${filteredWithdrawals.length} match · ${withdrawals?.length ?? 0} total`}
          </p>
        </div>
        <div className="space-y-1 w-full sm:max-w-xs">
          <Label className="text-xs">Search by user email</Label>
          <Input
            type="search"
            placeholder="e.g. name@domain.com"
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Fee %</TableHead>
                  <TableHead className="text-right">Fee ₹</TableHead>
                  <TableHead className="text-right">Net ₹</TableHead>
                  <TableHead>Bank Details</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWithdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="font-medium">{w.userName}</div>
                      <div className="text-xs text-muted-foreground">{w.userEmail}</div>
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatINR(w.requestAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.feePercent}</TableCell>
                    <TableCell className="text-right text-amber-400 tabular-nums">{formatINR(w.feeAmount)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-400 tabular-nums">{formatINR(w.netAmount)}</TableCell>
                    <TableCell className="max-w-[200px] text-xs text-muted-foreground whitespace-pre-line break-words">
                      {w.bankDetails ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(w.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={w.status === "approved" ? "success" : w.status === "rejected" ? "destructive" : "warning"}>
                        {w.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {w.status === "pending" && (
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-500 hover:text-emerald-400"
                            onClick={() => handleAction(w.id, "approved")}
                            disabled={isPending}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost-danger" onClick={() => handleAction(w.id, "rejected")} disabled={isPending}>
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredWithdrawals.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center p-8 text-muted-foreground">
                      {emailSearch.trim() ? "No withdrawals match that email." : "No withdrawal requests."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
