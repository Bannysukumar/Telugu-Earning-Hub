import { AppLayout } from "@/components/layout/app-layout";
import { useAdminGetDeposits, useAdminUpdateDeposit } from "@workspace/api-client-react";
import {
  Card,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Badge,
  Button,
  Input,
  Label,
} from "@/components/ui/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatINR, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";

export default function AdminDeposits() {
  const { data: deposits, isLoading } = useAdminGetDeposits();
  const [emailSearch, setEmailSearch] = useState("");
  const { mutate: updateStatus, isPending } = useAdminUpdateDeposit();
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    const list = deposits ?? [];
    const q = emailSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.userEmail.toLowerCase().includes(q));
  }, [deposits, emailSearch]);

  const handleAction = (id: string, status: "approved" | "rejected") => {
    updateStatus(
      { depositId: id, data: { status } },
      {
        onSuccess: () => {
          toast.success(`Deposit ${status}`);
          void queryClient.invalidateQueries();
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Update failed"),
      },
    );
  };

  return (
    <AppLayout isAdmin>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold">Manual deposits</h2>
          <p className="text-muted-foreground text-sm mt-1">
            QR / UPI proofs — approve to credit wallet balance.
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
          <div className="p-8">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Screenshot</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.userName}</div>
                      <div className="text-xs text-muted-foreground">{d.userEmail}</div>
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatINR(d.amount)}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[120px] break-all">{d.transactionId}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button type="button" size="sm" variant="outline" className="gap-1">
                            <ImageIcon className="h-4 w-4" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Payment screenshot</DialogTitle>
                          </DialogHeader>
                          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
                            <img src={d.screenshotUrl} alt="Proof" className="w-full h-auto max-h-[70vh] object-contain" />
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                    <TableCell className="max-w-[140px] text-xs text-muted-foreground break-words">{d.note ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(d.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "approved" ? "success" : d.status === "rejected" ? "destructive" : "warning"}>
                        {d.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status === "pending" && (
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-500 hover:text-emerald-400"
                            onClick={() => handleAction(d.id, "approved")}
                            disabled={isPending}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost-danger" onClick={() => handleAction(d.id, "rejected")} disabled={isPending}>
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center p-8 text-muted-foreground">
                      No deposit requests found.
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
