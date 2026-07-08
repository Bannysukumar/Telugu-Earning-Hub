import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetUserPaymentSettings,
  useGetMyDeposits,
  useGenerateDepositPayment,
  getGetMyDepositsQueryKey,
  getGetUserPaymentSettingsQueryKey,
  getGetDashboardQueryKey,
  type GenerateDepositPaymentResponse,
} from "@workspace/api-client-react";
import { AUTH_ME_QUERY_KEY } from "@/lib/query-keys";
import { Card, Button, Input, Label, Textarea, Badge, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/core";
import { apiUrl } from "@/lib/api-url";
import { upiQrImageUrl } from "@/lib/upi-qr";
import { formatINR, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QrCode, Upload, AlertCircle, Smartphone, RefreshCw } from "lucide-react";
import { useMemo, useState, useRef } from "react";

function parseAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export default function AddFund() {
  const { data: settings, isLoading: settingsLoading } = useGetUserPaymentSettings();
  const { data: depositsData, isLoading: depositsLoading } = useGetMyDeposits();
  const { mutate: generatePayment, isPending: generating } = useGenerateDepositPayment();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const clearFileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payment, setPayment] = useState<GenerateDepositPaymentResponse | null>(null);

  const pending = depositsData?.pendingDeposit ?? null;
  const history = depositsData?.history ?? [];
  const isLegacy = settings?.depositMethod === "legacy_qr";
  const isDynamic = settings?.depositMethod === "dynamic_upi";
  const amountNum = parseAmount(amount);
  const depositsEnabled = Boolean(settings?.isPaymentEnabled);
  const hasProof = transactionId.trim().length > 0 || file != null;

  const canGenerate =
    !pending && depositsEnabled && isDynamic && amountNum > 0 && !generating;

  const canSubmit =
    !pending &&
    depositsEnabled &&
    hasProof &&
    (isLegacy
      ? Boolean(settings?.qrCodeImageUrl) && amountNum > 0
      : payment != null && amountNum === payment.amount);

  const instructions = useMemo(() => {
    if (isDynamic) {
      return [
        "Enter the amount you want to add and tap Generate Payment.",
        "Scan the QR or tap Pay Now to open your UPI app with the amount pre-filled.",
        "Complete the payment, then submit your UTR and/or a screenshot below.",
      ];
    }
    return [
      "Scan the QR code with any UPI app.",
      "Pay the exact amount you will declare below.",
      "Copy the UPI transaction / reference ID (UTR).",
      "Upload a screenshot and/or enter your UTR for verification.",
    ];
  }, [isDynamic]);

  const onFile = (f: File | null) => {
    setFile(f);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (f && f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    }
  };

  const onAmountChange = (value: string) => {
    setAmount(value);
    if (payment && parseAmount(value) !== payment.amount) {
      setPayment(null);
    }
  };

  const onGeneratePayment = () => {
    if (!canGenerate) return;
    generatePayment(
      { data: { amount: amountNum } },
      {
        onSuccess: (data) => {
          setPayment(data);
          toast.success("Payment link ready. Complete payment in your UPI app.");
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Could not generate payment");
        },
      },
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const submitAmount = isDynamic && payment ? payment.amount : amountNum;
      const fd = new FormData();
      fd.set("amount", String(submitAmount));
      if (transactionId.trim()) fd.set("transactionId", transactionId.trim());
      if (note.trim()) fd.set("note", note.trim());
      if (file) fd.set("screenshot", file);
      if (payment?.selectedUpiId) fd.set("payeeUpiId", payment.selectedUpiId);

      const res = await fetch(apiUrl("/api/user/deposits"), {
        method: "POST",
        body: fd,
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Request failed");
        return;
      }

      toast.success(data.message ?? "Deposit request submitted.");
      setAmount("");
      setTransactionId("");
      setNote("");
      setPayment(null);
      onFile(null);
      if (clearFileRef.current) clearFileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: getGetMyDepositsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetUserPaymentSettingsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
    } finally {
      setSubmitting(false);
    }
  };

  const loading = settingsLoading || depositsLoading;

  return (
    <AppLayout>
      <div className="mb-8 max-w-3xl">
        <h2 className="text-3xl font-display font-bold flex items-center gap-2">
          <QrCode className="h-8 w-8 text-primary" />
          Add funds (UPI)
        </h2>
        <p className="text-muted-foreground mt-1">
          Pay via UPI, then submit proof for admin verification. Approved deposits credit your wallet.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-8 max-w-3xl">
          {!depositsEnabled ? (
            <Card className="p-4 border-amber-500/40 bg-amber-500/5">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm">
                  Deposits are currently <strong>disabled</strong>. Please try again later or contact support.
                </p>
              </div>
            </Card>
          ) : null}

          {pending ? (
            <Card className="p-4 border-primary/40 bg-primary/5">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Your previous request is pending. Please wait for admin approval.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Amount {formatINR(pending.amount)} · Txn {pending.transactionId || "—"} · Submitted{" "}
                    {formatDate(pending.createdAt)}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="font-bold text-lg">
                {isDynamic ? "1. Generate & pay" : "1. Scan & pay"}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc pl-5">
                {instructions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="amt-pay">Amount (₹)</Label>
                <Input
                  id="amt-pay"
                  inputMode="decimal"
                  placeholder="e.g. 1000"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  disabled={Boolean(pending) || !depositsEnabled}
                />
              </div>

              {isDynamic ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onGeneratePayment()}
                    disabled={!canGenerate}
                    isLoading={generating}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Generate payment
                  </Button>

                  {payment ? (
                    <div className="flex flex-col items-center gap-4 bg-secondary/20 rounded-xl p-6 border border-border">
                      <p className="text-sm text-muted-foreground text-center">
                        Pay <strong className="text-foreground">{formatINR(payment.amount)}</strong> to{" "}
                        <span className="font-mono text-foreground">{payment.selectedUpiId}</span>
                        {payment.payeeName ? (
                          <>
                            {" "}
                            ({payment.payeeName})
                          </>
                        ) : null}
                      </p>
                      <img
                        src={upiQrImageUrl(payment.upiDeepLink)}
                        alt="UPI QR code"
                        className="max-w-[min(100%,280px)] rounded-xl border border-border bg-card p-2 shadow-lg"
                      />
                      <Button
                        type="button"
                        className="gap-2 w-full sm:w-auto"
                        onClick={() => {
                          window.location.href = payment.upiDeepLink;
                        }}
                      >
                        <Smartphone className="h-4 w-4" />
                        Pay now
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Opens your UPI app with the amount pre-filled. After paying, submit proof below.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Enter an amount and generate a payment link to see the QR code.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 bg-secondary/20 rounded-xl p-6">
                  {settings?.qrCodeImageUrl ? (
                    <img
                      src={settings.qrCodeImageUrl}
                      alt="Payment QR"
                      className="max-w-[min(100%,280px)] rounded-xl border border-border bg-card p-2 shadow-lg"
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No QR has been uploaded yet. Ask an administrator to add one in Settings.
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <h3 className="font-bold text-lg">2. Submit payment proof</h3>
            <p className="text-sm text-muted-foreground">
              Provide your <strong>UTR / transaction ID</strong> and/or a <strong>screenshot</strong> (at least one
              required).
            </p>

            <div className="space-y-2">
              <Label htmlFor="tid">Transaction ID / UTR</Label>
              <Input
                id="tid"
                placeholder="From your UPI or bank receipt"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                disabled={Boolean(pending) || !depositsEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shot">Screenshot (optional if UTR provided)</Label>
              <Input
                id="shot"
                ref={clearFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="cursor-pointer"
                disabled={Boolean(pending) || !depositsEnabled}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 5 MB</p>
              {previewUrl ? (
                <div className="mt-2 rounded-xl border border-border overflow-hidden max-w-xs">
                  <img src={previewUrl} alt="Preview" className="w-full h-auto" />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                placeholder="e.g. Paid via GPay"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={Boolean(pending) || !depositsEnabled}
                rows={3}
              />
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto gap-2"
              onClick={() => void submit()}
              disabled={!canSubmit || submitting}
              isLoading={submitting}
            >
              <Upload className="h-4 w-4" />
              Submit request
            </Button>
          </Card>

          <div>
            <h3 className="text-xl font-display font-bold mb-4">Deposit history</h3>
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.createdAt)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatINR(row.amount)}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate">
                        {row.transactionId || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "warning"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[12rem] truncate">{row.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center p-8 text-muted-foreground">
                        No deposits yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
