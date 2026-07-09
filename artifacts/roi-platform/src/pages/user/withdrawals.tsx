import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetMyWithdrawals,
  useCreateWithdrawal,
  useGetMe,
  useGetWithdrawalFeeSettings,
  useListMyBankAccounts,
} from "@workspace/api-client-react";
import type { SavedBankAccount } from "@workspace/api-client-react";
import {
  Card,
  Button,
  Input,
  Label,
  Badge,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/core";
import { formatINR, formatDate, cn } from "@/lib/utils";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, AlertCircle, CheckCircle2, Users } from "lucide-react";
import { Link } from "wouter";
import { useMemo, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { getWithdrawalEligibilityStatus, type GrowthWithdrawalEligibility } from "@/lib/growth-plan-api";

function savedAccountSummary(a: { label?: string | null; bankName: string; accountNumber: string; ifscCode: string }): string {
  const tail = a.accountNumber.length <= 4 ? a.accountNumber : `…${a.accountNumber.slice(-4)}`;
  const nick = a.label?.trim();
  return nick ? `${nick} — ${a.bankName} · ${tail}` : `${a.bankName} · ${tail} (${a.ifscCode})`;
}

const amountFieldSchema = (minWithdrawal: number) =>
  z
    .string()
    .trim()
    .min(1, "Amount is required")
    .transform((s) => Number(s.replace(/,/g, "")))
    .pipe(
      z
        .number()
        .finite()
        .min(minWithdrawal, `Minimum withdrawal is ₹${minWithdrawal.toLocaleString("en-IN")}`),
    );

const withdrawalFormSchema = (minWithdrawal: number) =>
  z
    .object({
      amount: amountFieldSchema(minWithdrawal),
    bankName: z.string().trim().min(2, "Bank name is required"),
    ifscCode: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase().replace(/\s/g, ""))
      .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC (11 characters, e.g. HDFC0001234)")),
    accountNumber: z
      .string()
      .trim()
      .transform((s) => s.replace(/\s/g, ""))
      .pipe(
        z
          .string()
          .min(9, "Account number is too short")
          .max(18, "Account number is too long")
          .regex(/^\d+$/, "Account number must contain digits only"),
      ),
    confirmAccountNumber: z
      .string()
      .trim()
      .transform((s) => s.replace(/\s/g, "")),
    accountHolderName: z.string().trim().min(2, "Account holder name is required"),
    bankAccountLabel: z.string().max(80).optional().default(""),
  })
  .refine((d) => d.accountNumber === d.confirmAccountNumber, {
    path: ["confirmAccountNumber"],
    message: "Account numbers do not match",
  });

type WithdrawalFormInput = z.input<ReturnType<typeof withdrawalFormSchema>>;
type WithdrawalFormOutput = z.output<ReturnType<typeof withdrawalFormSchema>>;

function parseAmountPreview(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function WithdrawalEligibilityBanner({
  status,
  loading,
}: {
  status: GrowthWithdrawalEligibility | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-border/80">
        <div className="p-4 text-sm text-muted-foreground">Checking withdrawal eligibility…</div>
      </Card>
    );
  }
  if (!status) return null;

  const eligible = status.eligible;
  const borderClass = eligible
    ? "border-emerald-500/40 bg-emerald-500/5"
    : "border-amber-500/40 bg-amber-500/5";

  return (
    <Card className={cn("mb-6", borderClass)}>
      <div className="p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="flex items-start gap-3">
            {eligible ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className="font-semibold text-foreground">
                {eligible ? "You can submit a withdrawal" : "Withdrawal requirements not met yet"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {status.appliesGrowthRules
                  ? "Smart Growth rules: active plan + 2 active direct referrals on the ₹200 plan + minimum wallet balance."
                  : "Standard rules: wallet balance must meet the minimum withdrawal amount."}
              </p>
            </div>
          </div>
          {status.appliesGrowthRules ? (
            <Link href="/smart-growth" className="text-sm text-primary hover:underline shrink-0">
              View Smart Growth →
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Wallet balance</p>
            <p className="font-semibold tabular-nums">{formatINR(status.walletBalance)}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Minimum withdraw</p>
            <p className="font-semibold tabular-nums">{formatINR(status.minWithdrawal)}</p>
          </div>
          {status.appliesGrowthRules ? (
            <>
              <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Active referrals
                </p>
                <p className="font-semibold tabular-nums">
                  {status.activeDirects} / {status.requiredDirects}
                </p>
                <p className="text-[10px] text-muted-foreground">{status.totalDirects} signed up total</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Plan status</p>
                <p className="font-semibold capitalize">{status.planStatus ?? "—"}</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 col-span-2">
              <p className="text-xs text-muted-foreground">Amount still needed</p>
              <p className="font-semibold tabular-nums text-amber-400">
                {status.amountNeeded > 0 ? formatINR(status.amountNeeded) : "—"}
              </p>
            </div>
          )}
        </div>

        {status.blockers.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-amber-200/90">
            {status.blockers.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-amber-500 shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-400">
            Your wallet meets the minimum and all referral rules are satisfied. Enter an amount and submit below.
          </p>
        )}
      </div>
    </Card>
  );
}

export default function Withdrawals() {
  const { data: user } = useGetMe();
  const { data: history, isLoading } = useGetMyWithdrawals();
  const { data: feeSettings } = useGetWithdrawalFeeSettings();
  const { data: savedAccounts } = useListMyBankAccounts();
  const { mutate: requestWithdrawal, isPending } = useCreateWithdrawal();
  const queryClient = useQueryClient();

  const [payoutSource, setPayoutSource] = useState<"saved" | "new">("new");
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [saveToProfile, setSaveToProfile] = useState(true);
  const prefsSeeded = useRef(false);

  useEffect(() => {
    const list = savedAccounts ?? [];
    if (!list.length) {
      setPayoutSource("new");
      setSelectedSavedId("");
      return;
    }
    if (!prefsSeeded.current) {
      prefsSeeded.current = true;
      setPayoutSource("saved");
    }
    setSelectedSavedId((id) => (id && list.some((a: SavedBankAccount) => a.id === id) ? id : list[0]!.id));
  }, [savedAccounts]);

  const feePercent = feeSettings?.withdrawalFeePercent ?? 10;
  const minWithdrawalFromFees = feeSettings?.minWithdrawalAmount ?? 100;
  const formSchema = useMemo(
    () => withdrawalFormSchema(minWithdrawalFromFees),
    [minWithdrawalFromFees],
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    clearErrors,
    formState: { errors },
  } = useForm<WithdrawalFormInput, unknown, WithdrawalFormOutput>({
    resolver: zodResolver(formSchema) as Resolver<WithdrawalFormInput, unknown, WithdrawalFormOutput>,
    defaultValues: {
      amount: "",
      bankName: "",
      ifscCode: "",
      accountNumber: "",
      confirmAccountNumber: "",
      accountHolderName: "",
      bankAccountLabel: "",
    },
  });

  const amountRaw = useWatch({ control, name: "amount", defaultValue: "" });
  const amountForEligibility = parseAmountPreview(amountRaw);
  const eligibilityAmount =
    Number.isFinite(amountForEligibility) && amountForEligibility > 0 ? amountForEligibility : 0;

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: ["withdrawal-eligibility-status", eligibilityAmount, user?.walletBalance],
    queryFn: () => getWithdrawalEligibilityStatus(eligibilityAmount),
    enabled: Boolean(user),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const minWithdrawal = eligibility?.minWithdrawal ?? minWithdrawalFromFees;

  useEffect(() => {
    clearErrors();
  }, [payoutSource, clearErrors]);

  const canSubmitWithdrawal = eligibility ? eligibility.eligible : true;

  const preview = useMemo(() => {
    const requestAmount = parseAmountPreview(amountRaw);
    if (!Number.isFinite(requestAmount) || requestAmount < minWithdrawal) {
      return { requestAmount: null as number | null, feeAmount: 0, netAmount: 0 };
    }
    const feeAmount = Math.round((requestAmount * feePercent) / 100);
    const netAmount = requestAmount - feeAmount;
    return { requestAmount, feeAmount, netAmount };
  }, [amountRaw, feePercent, minWithdrawal]);

  const onSubmitNew = (data: WithdrawalFormOutput) => {
    if (user && data.amount > user.walletBalance) {
      toast.error("Insufficient wallet balance");
      return;
    }
    requestWithdrawal(
      {
        data: {
          amount: data.amount,
          bankName: data.bankName,
          ifscCode: data.ifscCode,
          accountNumber: data.accountNumber,
          accountHolderName: data.accountHolderName,
          saveBankAccount: saveToProfile,
          ...(data.bankAccountLabel?.trim() ? { bankAccountLabel: data.bankAccountLabel.trim() } : {}),
        },
      },
      {
        onSuccess: (res) => {
          toast.success("Withdrawal request submitted");
          if (res.bankAccountSaveWarning) {
            toast.message(res.bankAccountSaveWarning, { duration: 6000 });
          }
          reset();
          setSaveToProfile(true);
          queryClient.invalidateQueries();
          void queryClient.invalidateQueries({ queryKey: ["withdrawal-eligibility-status"] });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to request withdrawal";
          toast.error(msg);
        },
      },
    );
  };

  const submitSavedPayout = () => {
    const amt = amountFieldSchema(minWithdrawal).safeParse(amountRaw);
    if (!amt.success) {
      toast.error(amt.error.issues[0]?.message ?? "Invalid amount");
      return;
    }
    if (user && amt.data > user.walletBalance) {
      toast.error("Insufficient wallet balance");
      return;
    }
    if (!selectedSavedId) {
      toast.error("Select a bank account");
      return;
    }
    requestWithdrawal(
      { data: { amount: amt.data, bankAccountId: selectedSavedId } },
      {
        onSuccess: () => {
          toast.success("Withdrawal request submitted");
          queryClient.invalidateQueries();
          void queryClient.invalidateQueries({ queryKey: ["withdrawal-eligibility-status"] });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to request withdrawal";
          toast.error(msg);
        },
      },
    );
  };

  const hasSavedAccounts = (savedAccounts?.length ?? 0) > 0;

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold">Withdraw Funds</h2>
        <p className="text-muted-foreground">Transfer your earnings to your bank account</p>
      </div>

      <WithdrawalEligibilityBanner status={eligibility} loading={eligibilityLoading} />

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-primary text-primary-foreground border-none">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 opacity-80">
                <Wallet className="h-5 w-5" />
                <span className="font-medium">Available Balance</span>
              </div>
              <h3 className="text-4xl font-display font-bold mb-1">{formatINR(user?.walletBalance || 0)}</h3>
              <p className="text-sm opacity-80">Minimum withdrawal: {formatINR(minWithdrawal)}</p>
            </div>
          </Card>

          <Card>
            <div className="p-6 border-b border-border">
              <h3 className="font-bold text-lg">Request Withdrawal</h3>
            </div>
            <div className="p-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (payoutSource === "saved" && hasSavedAccounts) {
                    submitSavedPayout();
                  } else {
                    void handleSubmit(onSubmitNew)(e);
                  }
                }}
                className="space-y-4"
                noValidate
              >
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={minWithdrawal}
                    step="1"
                    {...register("amount")}
                    placeholder={`Minimum ${formatINR(minWithdrawal)}`}
                  />
                  {errors.amount?.message ? <p className="text-sm text-destructive">{errors.amount.message}</p> : null}
                </div>

                {preview.requestAmount != null && preview.requestAmount >= minWithdrawal ? (
                  <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                    <p className="font-medium text-foreground">Estimate (fee is locked when you submit)</p>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Requested amount</span>
                      <span className="font-semibold tabular-nums">{formatINR(preview.requestAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Fee ({feePercent}%)</span>
                      <span className="font-semibold tabular-nums text-amber-400">−{formatINR(preview.feeAmount)}</span>
                    </div>
                    {feeSettings?.customWithdrawalFeePercent != null ? (
                      <p className="text-xs text-muted-foreground">
                        Your account uses a custom withdrawal fee (site default is{" "}
                        {feeSettings.globalWithdrawalFeePercent ?? feePercent}%).
                      </p>
                    ) : null}
                    <div className="flex justify-between gap-2 pt-2 border-t border-border">
                      <span className="font-medium">You will receive (net)</span>
                      <span className="font-bold tabular-nums text-emerald-400">{formatINR(preview.netAmount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      The full {formatINR(preview.requestAmount)} is reserved from your wallet until the request is approved or rejected.
                    </p>
                  </div>
                ) : null}

                {hasSavedAccounts ? (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-foreground">Payout account</Label>
                    <div className="flex rounded-xl border border-border p-1 bg-secondary/30 gap-1">
                      <button
                        type="button"
                        onClick={() => setPayoutSource("saved")}
                        className={cn(
                          "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                          payoutSource === "saved" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Saved account
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayoutSource("new")}
                        className={cn(
                          "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                          payoutSource === "new" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        New details
                      </button>
                    </div>
                  </div>
                ) : null}

                {payoutSource === "saved" && hasSavedAccounts ? (
                  <div className="space-y-2">
                    <Label htmlFor="saved-bank-select">Choose bank account</Label>
                    <select
                      id="saved-bank-select"
                      className="flex h-12 w-full rounded-xl border border-border bg-background/50 px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
                      value={selectedSavedId}
                      onChange={(e) => setSelectedSavedId(e.target.value)}
                    >
                      {(savedAccounts ?? []).map((a: SavedBankAccount) => (
                        <option key={a.id} value={a.id}>
                          {savedAccountSummary(a)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Manage saved accounts anytime from{" "}
                      <Link href="/profile" className="text-primary hover:underline">
                        My profile
                      </Link>
                      .
                    </p>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-border space-y-4">
                    <p className="text-sm font-semibold text-foreground">Bank details</p>

                    <div className="space-y-2">
                      <Label>Optional label (e.g. &quot;My SBI&quot;)</Label>
                      <Input {...register("bankAccountLabel")} placeholder="Nickname in your profile" autoComplete="off" />
                      {errors.bankAccountLabel?.message ? (
                        <p className="text-sm text-destructive">{errors.bankAccountLabel.message}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Bank name</Label>
                      <Input {...register("bankName")} placeholder="e.g. State Bank of India" autoComplete="organization" />
                      {errors.bankName?.message ? <p className="text-sm text-destructive">{errors.bankName.message}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <Label>IFSC code</Label>
                      <Input
                        {...register("ifscCode")}
                        placeholder="e.g. HDFC0001234"
                        autoComplete="off"
                        className="uppercase"
                        maxLength={11}
                      />
                      {errors.ifscCode?.message ? <p className="text-sm text-destructive">{errors.ifscCode.message}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Account number</Label>
                      <Input {...register("accountNumber")} inputMode="numeric" autoComplete="off" />
                      {errors.accountNumber?.message ? <p className="text-sm text-destructive">{errors.accountNumber.message}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Confirm account number</Label>
                      <Input {...register("confirmAccountNumber")} inputMode="numeric" autoComplete="off" />
                      {errors.confirmAccountNumber?.message ? (
                        <p className="text-sm text-destructive">{errors.confirmAccountNumber.message}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Name of account holder</Label>
                      <Input {...register("accountHolderName")} placeholder="As per bank records" autoComplete="name" />
                      {errors.accountHolderName?.message ? (
                        <p className="text-sm text-destructive">{errors.accountHolderName.message}</p>
                      ) : null}
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer text-sm">
                      <Checkbox checked={saveToProfile} onCheckedChange={(v) => setSaveToProfile(v === true)} id="save-bank" />
                      <span className="text-muted-foreground">Save these bank details to my profile after a successful request</span>
                    </label>
                  </div>
                )}

                <div className="bg-amber-500/10 text-amber-400 p-3 rounded-xl flex gap-3 text-sm items-start">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>
                    Only one pending withdrawal at a time. Please wait ~45 seconds between submissions. Withdrawals are processed within 24–48 business
                    hours after approval.
                  </p>
                </div>

                <Button type="submit" className="w-full" isLoading={isPending} disabled={!canSubmitWithdrawal}>
                  Submit Request
                </Button>
                {!canSubmitWithdrawal && eligibility?.reason ? (
                  <p className="text-xs text-center text-amber-500">{eligibility.reason}</p>
                ) : null}
              </form>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <div className="p-6 border-b border-border">
              <h3 className="font-bold text-lg">Withdrawal History</h3>
            </div>
            <div className="p-0 overflow-x-auto">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : history?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Net</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>{formatDate(w.createdAt)}</TableCell>
                        <TableCell className="font-medium tabular-nums">{formatINR(w.requestAmount)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm tabular-nums">
                          {w.feePercent}% ({formatINR(w.feeAmount)})
                        </TableCell>
                        <TableCell className="font-semibold text-emerald-400 tabular-nums">{formatINR(w.netAmount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              w.status === "approved" ? "success" : w.status === "rejected" ? "destructive" : "warning"
                            }
                          >
                            {w.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center text-muted-foreground">No withdrawal history found.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
