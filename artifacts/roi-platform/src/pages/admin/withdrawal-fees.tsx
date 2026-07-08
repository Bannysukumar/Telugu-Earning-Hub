import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetWithdrawalFees,
  useAdminSetUserWithdrawalFee,
  useAdminClearUserWithdrawalFee,
  getAdminGetWithdrawalFeesQueryKey,
  type AdminWithdrawalFeeRow,
} from "@workspace/api-client-react";
import { Button, Card, Input, Label, Modal } from "@/components/ui/core";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Percent, Search } from "lucide-react";

export default function AdminWithdrawalFees() {
  const { data, isLoading } = useAdminGetWithdrawalFees();
  const { mutate: setFee, isPending: saving } = useAdminSetUserWithdrawalFee();
  const { mutate: clearFee, isPending: clearing } = useAdminClearUserWithdrawalFee();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminWithdrawalFeeRow | null>(null);
  const [feeInput, setFeeInput] = useState("10");

  const globalPercent = data?.globalWithdrawalFeePercent ?? 10;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.users ?? [];
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q),
    );
  }, [data?.users, search]);

  const openEdit = (row: AdminWithdrawalFeeRow) => {
    setEditing(row);
    setFeeInput(
      row.customWithdrawalFeePercent != null
        ? String(row.customWithdrawalFeePercent)
        : String(row.effectiveWithdrawalFeePercent),
    );
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getAdminGetWithdrawalFeesQueryKey() });
  };

  const onSave = () => {
    if (!editing) return;
    const n = Number(feeInput);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a fee between 0 and 100.");
      return;
    }
    setFee(
      { userId: editing.userId, data: { withdrawalFeePercent: n } },
      {
        onSuccess: () => {
          toast.success(`Withdrawal fee set to ${n}% for ${editing.name}.`);
          invalidate();
          setEditing(null);
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
      },
    );
  };

  const onClear = () => {
    if (!editing) return;
    clearFee(
      { userId: editing.userId },
      {
        onSuccess: () => {
          toast.success(`${editing.name} now uses the global fee (${globalPercent}%).`);
          invalidate();
          setEditing(null);
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Clear failed"),
      },
    );
  };

  return (
    <AppLayout isAdmin>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Percent className="h-7 w-7 text-primary" />
            Per-user withdrawal fees
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Set a custom withdrawal fee for individual members. If none is set, they use the global fee from{" "}
            <Link href="/admin/settings" className="text-primary hover:underline">
              Settings
            </Link>{" "}
            (currently <strong className="text-foreground">{globalPercent}%</strong>).
          </p>
        </div>

        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, or user ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-4 font-medium">Member</th>
                  <th className="p-4 font-medium">Custom fee</th>
                  <th className="p-4 font-medium">Effective fee</th>
                  <th className="p-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-muted-foreground">
                      No members match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.userId} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="p-4">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      </td>
                      <td className="p-4">
                        {row.customWithdrawalFeePercent != null ? (
                          <span className="font-mono tabular-nums">{row.customWithdrawalFeePercent}%</span>
                        ) : (
                          <span className="text-muted-foreground">Global default</span>
                        )}
                      </td>
                      <td className="p-4 font-mono tabular-nums">{row.effectiveWithdrawalFeePercent}%</td>
                      <td className="p-4 text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                          Set fee
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Withdrawal fee · ${editing.name}` : "Withdrawal fee"}
      >
        {editing ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Global default: <strong className="text-foreground">{globalPercent}%</strong>. This member&apos;s next
              withdrawal uses the fee you set here.
            </p>
            <div className="space-y-2">
              <Label htmlFor="user-withdrawal-fee">Withdrawal fee (%)</Label>
              <Input
                id="user-withdrawal-fee"
                type="number"
                min={0}
                max={100}
                step={1}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              {editing.customWithdrawalFeePercent != null ? (
                <Button type="button" variant="outline" onClick={onClear} disabled={saving || clearing}>
                  Use global default
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={onSave} disabled={saving || clearing}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppLayout>
  );
}
