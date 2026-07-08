import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import {
  getGetMyDirectLevelQueryOptions,
  useChangePassword,
  useGetMyDirectLevel,
  useGetMyInvestments,
  useUpdateProfile,
  useListMyBankAccounts,
  useCreateMyBankAccount,
  useUpdateMyBankAccount,
  useDeleteMyBankAccount,
} from "@workspace/api-client-react";
import { Card, CardContent, Button, Input, Label, Badge } from "@/components/ui/core";
import { Progress } from "@/components/ui/progress";
import { formatINR, formatDate } from "@/lib/utils";
import { User, Mail, Wallet, Calendar, Save, Activity, Target, ChevronRight, Users, ArrowUp, Lock, Landmark, Trash2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedBankAccount } from "@workspace/api-client-react";
import { Link } from "wouter";
import { usePlatformFeatures } from "@/hooks/use-platform-features";
import { getGrowthDashboard } from "@/lib/growth-plan-api";

function capProgressPercent(totalEarned: number, maxReturn: number): number {
  if (!Number.isFinite(maxReturn) || maxReturn <= 0) return 0;
  return Math.min(100, (totalEarned / maxReturn) * 100);
}

function growthStatusLabel(status: string | undefined): string {
  if (status === "active") return "Active";
  if (status === "completed") return "Completed";
  if (status === "expired") return "Expired";
  return "Pending";
}

export default function Profile() {
  const { binaryPlanEnabled } = usePlatformFeatures();
  const { user, login: setAuth } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const { mutate: update, isPending } = useUpdateProfile();
  const { mutate: changePassword, isPending: isChangingPassword } = useChangePassword();
  const { data: investments, isLoading: investmentsLoading } = useGetMyInvestments();
  const { data: directLevel, isLoading: directsLoading } = useGetMyDirectLevel({
    query: { ...getGetMyDirectLevelQueryOptions(), staleTime: 120_000 },
  });
  const queryClient = useQueryClient();
  const { data: growthDash } = useQuery({
    queryKey: ["growth-plan-dashboard"],
    queryFn: getGrowthDashboard,
    retry: 1,
  });

  const sortedInvestments = useMemo(() => {
    if (!investments?.length) return [];
    return [...investments].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
  }, [investments]);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    update(
      { data: { name } },
      {
        onSuccess: () => {
          toast.success("Profile updated successfully");
          queryClient.invalidateQueries();
        },
        onError: () => toast.error("Failed to update profile"),
      },
    );
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error("Fill in all password fields");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match");
      return;
    }
    changePassword(
      {
        data: {
          currentPassword,
          newPassword,
          confirmNewPassword,
        },
      },
      {
        onSuccess: (res) => {
          if (user) {
            setAuth(res.token, user);
          }
          setCurrentPassword("");
          setNewPassword("");
          setConfirmNewPassword("");
          toast.success(res.message || "Password updated successfully");
        },
        onError: (err: Error) => {
          toast.error(err.message || "Could not change password");
        },
      },
    );
  };

  const { data: bankAccounts, isLoading: banksLoading } = useListMyBankAccounts();
  const { mutate: createBank, isPending: creatingBank } = useCreateMyBankAccount();
  const { mutate: updateBank, isPending: updatingBank } = useUpdateMyBankAccount();
  const { mutate: deleteBank, isPending: deletingBank } = useDeleteMyBankAccount();

  const [bankFormMode, setBankFormMode] = useState<"idle" | "add" | "edit">("idle");
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankDraft, setBankDraft] = useState({
    label: "",
    bankName: "",
    ifscCode: "",
    accountNumber: "",
    accountHolderName: "",
  });

  const resetBankDraft = () => {
    setBankDraft({ label: "", bankName: "", ifscCode: "", accountNumber: "", accountHolderName: "" });
  };

  const openAddBank = () => {
    resetBankDraft();
    setEditingBankId(null);
    setBankFormMode("add");
  };

  const openEditBank = (a: SavedBankAccount) => {
    setBankDraft({
      label: a.label ?? "",
      bankName: a.bankName,
      ifscCode: a.ifscCode,
      accountNumber: a.accountNumber,
      accountHolderName: a.accountHolderName,
    });
    setEditingBankId(a.id);
    setBankFormMode("edit");
  };

  const closeBankForm = () => {
    setBankFormMode("idle");
    setEditingBankId(null);
    resetBankDraft();
  };

  const submitBankForm = () => {
    const bankName = bankDraft.bankName.trim();
    const ifscCode = bankDraft.ifscCode.trim().toUpperCase().replace(/\s/g, "");
    const accountNumber = bankDraft.accountNumber.trim().replace(/\s/g, "");
    const accountHolderName = bankDraft.accountHolderName.trim();
    const label = bankDraft.label.trim();
    if (bankName.length < 2) {
      toast.error("Bank name is required");
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      toast.error("Invalid IFSC (11 characters, e.g. HDFC0001234)");
      return;
    }
    if (!/^\d{9,18}$/.test(accountNumber)) {
      toast.error("Account number must be 9–18 digits");
      return;
    }
    if (accountHolderName.length < 2) {
      toast.error("Account holder name is required");
      return;
    }

    if (bankFormMode === "add") {
      createBank(
        {
          data: {
            bankName,
            ifscCode,
            accountNumber,
            accountHolderName,
            ...(label ? { label } : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success("Bank account saved");
            closeBankForm();
            queryClient.invalidateQueries();
          },
          onError: (err: Error) => toast.error(err.message || "Could not save"),
        },
      );
      return;
    }

    if (bankFormMode === "edit" && editingBankId) {
      updateBank(
        {
          accountId: editingBankId,
          data: {
            bankName,
            ifscCode,
            accountNumber,
            accountHolderName,
            label: label || null,
          },
        },
        {
          onSuccess: () => {
            toast.success("Bank account updated");
            closeBankForm();
            queryClient.invalidateQueries();
          },
          onError: (err: Error) => toast.error(err.message || "Could not update"),
        },
      );
    }
  };

  const handleDeleteBank = (id: string) => {
    if (!window.confirm("Remove this saved bank account from your profile?")) return;
    deleteBank(
      { accountId: id },
      {
        onSuccess: () => {
          toast.success("Bank account removed");
          queryClient.invalidateQueries();
        },
        onError: (err: Error) => toast.error(err.message || "Could not remove"),
      },
    );
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold">My Profile</h2>
        <p className="text-muted-foreground">Manage your account information</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-display font-bold text-lg">Your plans</h3>
              </div>
              <Link href="/investments" className="text-sm text-primary hover:underline inline-flex items-center gap-0.5">
                All investments <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {investmentsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading your plans…</p>
            ) : !sortedInvestments.length ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-center">
                <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground mb-3">You don&apos;t have an investment plan yet.</p>
                <Link href="/plans">
                  <Button variant="outline" size="sm">
                    Browse plans
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-5">
                {sortedInvestments.map((inv) => {
                  const daysRemaining = inv.isActive ? Math.max(0, inv.maxDays - inv.daysCompleted) : 0;
                  const capPct = capProgressPercent(inv.totalEarned, inv.maxReturn);
                  const statusLabel =
                    inv.status === "active"
                      ? "Active"
                      : inv.status === "manually_stopped"
                        ? "Manually stopped"
                        : "Completed";
                  const variant = inv.isActive ? "success" : "default";

                  return (
                    <li key={inv.id} className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{inv.planName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Started {formatDate(inv.startDate).split(",")[0]}
                          </p>
                        </div>
                        <Badge variant={variant}>{statusLabel}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Days completed</p>
                          <p className="font-semibold tabular-nums">
                            {inv.daysCompleted}
                            <span className="text-muted-foreground font-normal"> / {inv.maxDays}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Days remaining</p>
                          <p className="font-semibold tabular-nums">
                            {inv.isActive ? daysRemaining : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs gap-2">
                          <span className="text-muted-foreground">Return cap (2× limit)</span>
                          <span className="font-medium tabular-nums shrink-0">
                            {formatINR(inv.totalEarned)} / {formatINR(inv.maxReturn)}
                          </span>
                        </div>
                        <Progress value={capPct} className="h-2.5 bg-secondary" />
                        <p className="text-xs text-muted-foreground text-right tabular-nums">{capPct.toFixed(1)}% of cap</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <h3 className="font-display font-bold text-lg">Saved bank accounts</h3>
              </div>
              <Link href="/withdraw" className="text-sm text-primary hover:underline inline-flex items-center gap-0.5">
                Withdraw <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Use these on the withdraw page or manage them here (up to 10). Same IFSC + account number updates the existing entry.
            </p>

            {banksLoading ? (
              <p className="text-sm text-muted-foreground py-2">Loading saved accounts…</p>
            ) : bankAccounts?.length ? (
              <ul className="space-y-3 mb-4">
                {bankAccounts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-border bg-secondary/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="text-sm min-w-0">
                      <p className="font-medium text-foreground">
                        {a.label?.trim() ? a.label : a.bankName}{" "}
                        <span className="text-muted-foreground font-normal tabular-nums">· {a.ifscCode}</span>
                      </p>
                      <p className="text-muted-foreground tabular-nums mt-0.5 break-all">{a.accountNumber}</p>
                      <p className="text-xs text-muted-foreground mt-1">{a.accountHolderName}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => openEditBank(a)}
                        disabled={bankFormMode !== "idle" || deletingBank}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost-danger"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleDeleteBank(a.id)}
                        disabled={deletingBank || bankFormMode !== "idle"}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground py-2 mb-4">No saved accounts yet. Add one here or save when you request a withdrawal.</p>
            )}

            {bankFormMode === "idle" ? (
              <Button type="button" variant="outline" className="gap-2 w-full sm:w-auto" onClick={openAddBank}>
                <Plus className="h-4 w-4" /> Add bank account
              </Button>
            ) : (
              <div className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{bankFormMode === "add" ? "New account" : "Edit account"}</p>
                  <Button type="button" variant="ghost" size="sm" onClick={closeBankForm}>
                    Cancel
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input
                    value={bankDraft.label}
                    onChange={(e) => setBankDraft((d) => ({ ...d, label: e.target.value }))}
                    placeholder="e.g. My SBI"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank name</Label>
                  <Input
                    value={bankDraft.bankName}
                    onChange={(e) => setBankDraft((d) => ({ ...d, bankName: e.target.value }))}
                    placeholder="Bank name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>IFSC</Label>
                  <Input
                    value={bankDraft.ifscCode}
                    onChange={(e) => setBankDraft((d) => ({ ...d, ifscCode: e.target.value }))}
                    className="uppercase"
                    maxLength={11}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account number</Label>
                  <Input
                    value={bankDraft.accountNumber}
                    onChange={(e) => setBankDraft((d) => ({ ...d, accountNumber: e.target.value }))}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account holder name</Label>
                  <Input
                    value={bankDraft.accountHolderName}
                    onChange={(e) => setBankDraft((d) => ({ ...d, accountHolderName: e.target.value }))}
                    placeholder="As per bank records"
                  />
                </div>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={submitBankForm}
                  isLoading={creatingBank || updatingBank}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {bankFormMode === "add" ? "Save account" : "Update account"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-5 mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center text-primary font-bold text-3xl">
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold">{user?.name}</h3>
                <p className="text-muted-foreground text-sm">{user?.email}</p>
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium capitalize">
                  {user?.role}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-4 mb-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ArrowUp className="h-4 w-4 text-primary" />
                Your upliner (sponsor)
              </div>
              {user?.referrerId ? (
                <div className="text-sm">
                  <p className="font-medium">{user.referrerName ?? "—"}</p>
                  <p className="text-muted-foreground">{user.referrerEmail ?? "—"}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">You joined without a referral sponsor.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-secondary/40 rounded-xl p-4 flex items-center gap-3">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Wallet Balance</p>
                  <p className="font-bold text-emerald-400">{formatINR(user?.walletBalance || 0)}</p>
                </div>
              </div>
              <div className="bg-secondary/40 rounded-xl p-4 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="font-bold">{user?.createdAt ? formatDate(user.createdAt.toString()).split(",")[0] : "—"}</p>
                </div>
              </div>
            </div>

            {growthDash ? (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-secondary/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Smart Growth Status</p>
                  <p className="font-bold">{growthStatusLabel(growthDash.planStatus)}</p>
                </div>
                <div className="bg-secondary/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Smart Growth Days Remaining</p>
                  <p className="font-bold tabular-nums">
                    {growthDash.planStatus === "active" ? growthDash.remainingDays : "—"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4" /> Full Name
                </Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4" /> Email Address
                </Label>
                <Input value={user?.email || ""} disabled className="opacity-60 cursor-not-allowed" />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
              <Button onClick={handleSave} isLoading={isPending} className="w-full">
                <Save className="h-4 w-4 mr-2" /> Save Changes
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-border space-y-4">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  Change password
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your current password, then choose a new one (minimum 6 characters).
                </p>
              </div>
              <div>
                <Label className="mb-2 block">Current password</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <Label className="mb-2 block">New password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <Label className="mb-2 block">Confirm new password</Label>
                <Input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleChangePassword}
                isLoading={isChangingPassword}
                className="w-full"
              >
                <Lock className="h-4 w-4 mr-2" />
                Update password
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-display font-bold text-lg">Your downliners (direct referrals)</h3>
            </div>
            {directsLoading ? (
              <p className="text-sm text-muted-foreground py-2">Loading downliners…</p>
            ) : !directLevel?.directs?.length ? (
              <p className="text-sm text-muted-foreground py-2">
                No direct referrals yet. Share your referral link from the dashboard.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {directLevel.directs.map((d) => (
                  <li key={d.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-secondary/20">
                    <div>
                      <p className="font-medium text-sm">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.email}</p>
                    </div>
                    {binaryPlanEnabled && d.binarySide ? (
                      <Badge variant="outline" className="w-fit text-[10px]">
                        {d.binarySide === "left" ? "Left leg" : "Right leg"}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
