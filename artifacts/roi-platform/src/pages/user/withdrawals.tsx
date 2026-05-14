import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetMyWithdrawals,
  useCreateWithdrawal,
  useGetMe,
  useGetWithdrawalFeeSettings,
} from "@workspace/api-client-react";
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
import { formatINR, formatDate } from "@/lib/utils";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet, AlertCircle } from "lucide-react";
import { useMemo } from "react";

function formatBankDetailsForApi(values: {
  bankName: string;
  ifscCode: string;
  accountNumber: string;
  accountHolderName: string;
}): string {
  return [
    `Bank: ${values.bankName}`,
    `IFSC: ${values.ifscCode}`,
    `Account: ${values.accountNumber}`,
    `Account holder: ${values.accountHolderName}`,
  ].join("\n");
}

const withdrawalFormSchema = z
  .object({
    amount: z
      .string()
      .trim()
      .min(1, "Amount is required")
      .transform((s) => Number(s.replace(/,/g, "")))
      .pipe(z.number().finite().min(500, "Minimum withdrawal is ₹500")),
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
  })
  .refine((d) => d.accountNumber === d.confirmAccountNumber, {
    path: ["confirmAccountNumber"],
    message: "Account numbers do not match",
  });

type WithdrawalFormInput = z.input<typeof withdrawalFormSchema>;
type WithdrawalFormOutput = z.output<typeof withdrawalFormSchema>;

function parseAmountPreview(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default function Withdrawals() {
  const { data: user } = useGetMe();
  const { data: history, isLoading } = useGetMyWithdrawals();
  const { data: feeSettings } = useGetWithdrawalFeeSettings();
  const { mutate: requestWithdrawal, isPending } = useCreateWithdrawal();
  const queryClient = useQueryClient();

  const feePercent = feeSettings?.withdrawalFeePercent ?? 10;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<WithdrawalFormInput, unknown, WithdrawalFormOutput>({
    resolver: zodResolver(withdrawalFormSchema) as Resolver<WithdrawalFormInput, unknown, WithdrawalFormOutput>,
    defaultValues: {
      amount: "",
      bankName: "",
      ifscCode: "",
      accountNumber: "",
      confirmAccountNumber: "",
      accountHolderName: "",
    },
  });

  const amountRaw = useWatch({ control, name: "amount", defaultValue: "" });

  const preview = useMemo(() => {
    const requestAmount = parseAmountPreview(amountRaw);
    if (!Number.isFinite(requestAmount) || requestAmount < 500) {
      return { requestAmount: null as number | null, feeAmount: 0, netAmount: 0 };
    }
    const feeAmount = Math.round((requestAmount * feePercent) / 100);
    const netAmount = requestAmount - feeAmount;
    return { requestAmount, feeAmount, netAmount };
  }, [amountRaw, feePercent]);

  const onSubmit = (data: WithdrawalFormOutput) => {
    if (user && data.amount > user.walletBalance) {
      toast.error("Insufficient wallet balance");
      return;
    }
    const bankDetails = formatBankDetailsForApi({
      bankName: data.bankName,
      ifscCode: data.ifscCode,
      accountNumber: data.accountNumber,
      accountHolderName: data.accountHolderName,
    });
    requestWithdrawal(
      { data: { amount: data.amount, bankDetails } },
      {
        onSuccess: () => {
          toast.success("Withdrawal request submitted");
          reset();
          queryClient.invalidateQueries();
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to request withdrawal"),
      },
    );
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold">Withdraw Funds</h2>
        <p className="text-muted-foreground">Transfer your earnings to your bank account</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-primary text-primary-foreground border-none">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 opacity-80">
                <Wallet className="h-5 w-5" />
                <span className="font-medium">Available Balance</span>
              </div>
              <h3 className="text-4xl font-display font-bold mb-1">{formatINR(user?.walletBalance || 0)}</h3>
              <p className="text-sm opacity-80">Minimum withdrawal: ₹500</p>
            </div>
          </Card>

          <Card>
            <div className="p-6 border-b border-border">
              <h3 className="font-bold text-lg">Request Withdrawal</h3>
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input type="number" inputMode="decimal" min={500} step="1" {...register("amount")} placeholder="Minimum ₹500" />
                  {errors.amount?.message ? <p className="text-sm text-destructive">{errors.amount.message}</p> : null}
                </div>

                {preview.requestAmount != null && preview.requestAmount >= 500 ? (
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
                    <div className="flex justify-between gap-2 pt-2 border-t border-border">
                      <span className="font-medium">You will receive (net)</span>
                      <span className="font-bold tabular-nums text-emerald-400">{formatINR(preview.netAmount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      The full {formatINR(preview.requestAmount)} is reserved from your wallet until the request is approved or rejected.
                    </p>
                  </div>
                ) : null}

                <div className="pt-2 border-t border-border space-y-4">
                  <p className="text-sm font-semibold text-foreground">Bank details</p>

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
                </div>

                <div className="bg-amber-500/10 text-amber-400 p-3 rounded-xl flex gap-3 text-sm items-start">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>
                    Only one pending withdrawal at a time. Please wait ~45 seconds between submissions. Withdrawals are processed within 24–48 business
                    hours after approval.
                  </p>
                </div>

                <Button type="submit" className="w-full" isLoading={isPending}>
                  Submit Request
                </Button>
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
