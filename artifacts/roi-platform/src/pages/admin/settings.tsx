import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetSettings,
  useAdminUpdateSettings,
  getAdminGetSettingsQueryKey,
  useAdminGetPaymentSettings,
  useAdminUpdatePaymentSettings,
  getAdminGetPaymentSettingsQueryKey,
  getGetPlatformFeaturesQueryKey,
  type PaymentSettingsDepositMethod,
} from "@workspace/api-client-react";
import { Button, Card, Input, Label } from "@/components/ui/core";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/lib/api-url";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { QrCode, Settings, Upload, Plus, Trash2, GitBranch, UserPlus, Target } from "lucide-react";
import { Link } from "wouter";

export default function AdminSettings() {
  const { data, isLoading } = useAdminGetSettings();
  const { mutate: save, isPending } = useAdminUpdateSettings();
  const { data: pay, isLoading: payLoading } = useAdminGetPaymentSettings();
  const { mutate: savePay, isPending: paySaving } = useAdminUpdatePaymentSettings();
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState("10");
  const [peerPercent, setPeerPercent] = useState("0");
  const [payEnabled, setPayEnabled] = useState(false);
  const [depositMethod, setDepositMethod] = useState<PaymentSettingsDepositMethod>("dynamic_upi");
  const [payeeName, setPayeeName] = useState("Telugu Earning Hub");
  const [upiIds, setUpiIds] = useState<string[]>([]);
  const [newUpiId, setNewUpiId] = useState("");
  const qrInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQr, setUploadingQr] = useState(false);

  useEffect(() => {
    if (data?.withdrawalFeePercent != null) {
      setPercent(String(data.withdrawalFeePercent));
    }
  }, [data?.withdrawalFeePercent]);

  useEffect(() => {
    if (data?.peerTransferFeePercent != null) {
      setPeerPercent(String(data.peerTransferFeePercent));
    }
  }, [data?.peerTransferFeePercent]);

  useEffect(() => {
    if (pay?.isPaymentEnabled != null) {
      setPayEnabled(pay.isPaymentEnabled);
    }
    if (pay?.depositMethod) {
      setDepositMethod(pay.depositMethod);
    }
    if (pay?.payeeName) {
      setPayeeName(pay.payeeName);
    }
    if (pay?.upiIds) {
      setUpiIds(pay.upiIds);
    }
  }, [pay?.isPaymentEnabled, pay?.depositMethod, pay?.payeeName, pay?.upiIds]);

  const onSave = () => {
    const n = Number(percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a percentage between 0 and 100.");
      return;
    }
    save(
      { data: { withdrawalFeePercent: n } },
      {
        onSuccess: () => {
          toast.success("Withdrawal fee updated.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const onSavePeer = () => {
    const n = Number(peerPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a percentage between 0 and 100.");
      return;
    }
    save(
      { data: { peerTransferFeePercent: n } },
      {
        onSuccess: () => {
          toast.success("Send funds & gift plan fee updated.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const persistPayEnabled = (next: boolean) => {
    if (pay?.isPaymentEnabled === next) {
      setPayEnabled(next);
      return;
    }
    setPayEnabled(next);
    savePay(
      { data: { isPaymentEnabled: next } },
      {
        onSuccess: () => {
          toast.success(next ? "Deposits enabled." : "Deposits disabled.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetPaymentSettingsQueryKey() });
        },
        onError: (err: unknown) => {
          setPayEnabled(!next);
          toast.error(err instanceof Error ? err.message : "Save failed");
        },
      },
    );
  };

  const persistBinaryPlanEnabled = (next: boolean) => {
    if (data?.binaryPlanEnabled === next) return;
    save(
      { data: { binaryPlanEnabled: next } },
      {
        onSuccess: () => {
          toast.success(next ? "Binary plan enabled site-wide." : "Binary plan hidden and payouts disabled.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetPlatformFeaturesQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const persistDirectIncomeEnabled = (next: boolean) => {
    if (data?.directIncomeEnabled === next) return;
    save(
      { data: { directIncomeEnabled: next } },
      {
        onSuccess: () => {
          toast.success(next ? "Direct income enabled." : "Direct income disabled — plan forms hide direct bonus.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetPlatformFeaturesQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const persistStandalonePlanCreationOnly = (next: boolean) => {
    if (data?.standalonePlanCreationOnly === next) return;
    save(
      { data: { standalonePlanCreationOnly: next } },
      {
        onSuccess: () => {
          toast.success(
            next
              ? "Create Plan will only allow standalone (ROI-only) packages."
              : "Create Plan can add MLM or standalone packages again.",
          );
          void queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const persistDepositMethod = (next: PaymentSettingsDepositMethod) => {
    if (pay?.depositMethod === next) {
      setDepositMethod(next);
      return;
    }
    setDepositMethod(next);
    savePay(
      { data: { depositMethod: next } },
      {
        onSuccess: () => {
          toast.success(
            next === "dynamic_upi" ? "Dynamic UPI deposits enabled." : "Legacy static QR mode enabled.",
          );
          void queryClient.invalidateQueries({ queryKey: getAdminGetPaymentSettingsQueryKey() });
        },
        onError: (err: unknown) => {
          setDepositMethod(pay?.depositMethod ?? "dynamic_upi");
          toast.error(err instanceof Error ? err.message : "Save failed");
        },
      },
    );
  };

  const addUpiId = () => {
    const v = newUpiId.trim().toLowerCase();
    if (!v) {
      toast.error("Enter a UPI ID (e.g. name@paytm).");
      return;
    }
    if (upiIds.includes(v)) {
      toast.error("This UPI ID is already in the list.");
      return;
    }
    setUpiIds((prev) => [...prev, v]);
    setNewUpiId("");
  };

  const removeUpiId = (id: string) => {
    setUpiIds((prev) => prev.filter((x) => x !== id));
  };

  const saveUpiSettings = () => {
    const name = payeeName.trim();
    if (!name) {
      toast.error("Payee name is required.");
      return;
    }
    if (depositMethod === "dynamic_upi" && upiIds.length === 0) {
      toast.error("Add at least one UPI ID for dynamic deposits.");
      return;
    }
    savePay(
      { data: { payeeName: name, upiIds } },
      {
        onSuccess: () => {
          toast.success("UPI settings saved.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetPaymentSettingsQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const uploadQrFile = async (file: File) => {
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.set("qr", file);
      const res = await fetch(apiUrl("/api/admin/payment-settings/qr"), { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; qrCodeImageUrl?: string };

      if (!res.ok) {
        toast.error(typeof body.error === "string" ? body.error : "Upload failed");
        return;
      }
      toast.success("QR code updated.");
      void queryClient.invalidateQueries({ queryKey: getAdminGetPaymentSettingsQueryKey() });
    } finally {
      setUploadingQr(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  };

  return (
    <AppLayout isAdmin>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold flex items-center gap-2">
          <Settings className="h-8 w-8 text-primary" />
          Platform settings
        </h2>
        <p className="text-muted-foreground mt-1">Withdrawal, member-to-member send, gift-plan fees, and manual UPI / QR deposit configuration.</p>
      </div>

      <div className="grid gap-8 max-w-2xl">
        <Card className="max-w-md">
          <div className="p-6 border-b border-border">
            <h3 className="font-bold text-lg">Withdrawal fee</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Default for all members. Deducted from the amount requested; the full gross is held from the wallet. For one member only, use{" "}
              <Link href="/admin/withdrawal-fees" className="text-primary hover:underline">
                Withdrawal fees
              </Link>
              .
            </p>
          </div>
          <div className="p-6 space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fee-pct">Fee percentage (%)</Label>
                  <Input
                    id="fee-pct"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Default when unset in database: 10%.</p>
                </div>
                <Button type="button" onClick={onSave} isLoading={isPending} className="w-full sm:w-auto">
                  Save settings
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card className="max-w-md">
          <div className="p-6 border-b border-border flex items-start gap-3">
            <GitBranch className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-lg">Smart Binary plan</h3>
              <p className="text-sm text-muted-foreground mt-1">
                When off, binary pages, tree views, leg selection at signup, and binary pair payouts are hidden or
                disabled across the site (including admin).
              </p>
            </div>
          </div>
          <div className="p-6 flex items-center justify-between gap-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div>
                  <p className="font-medium">{data?.binaryPlanEnabled !== false ? "Enabled" : "Disabled"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Applies immediately after save.</p>
                </div>
                <Switch
                  checked={data?.binaryPlanEnabled !== false}
                  onCheckedChange={(on) => persistBinaryPlanEnabled(on)}
                  disabled={isPending}
                />
              </>
            )}
          </div>
        </Card>

        <Card className="max-w-md">
          <div className="p-6 border-b border-border flex items-start gap-3">
            <UserPlus className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-lg">Direct income</h3>
              <p className="text-sm text-muted-foreground mt-1">
                When on, MLM plans can set a direct referral bonus (paid on a member&apos;s first investment). When off,
                that field is hidden in Investment Plans and no direct bonus is paid.
              </p>
            </div>
          </div>
          <div className="p-6 flex items-center justify-between gap-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div>
                  <p className="font-medium">{data?.directIncomeEnabled !== false ? "Enabled" : "Disabled"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Applies immediately after save.</p>
                </div>
                <Switch
                  checked={data?.directIncomeEnabled !== false}
                  onCheckedChange={(on) => persistDirectIncomeEnabled(on)}
                  disabled={isPending}
                />
              </>
            )}
          </div>
        </Card>

        <Card className="max-w-md">
          <div className="p-6 border-b border-border flex items-start gap-3">
            <Target className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-lg">Standalone plans only (Create Plan)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                When on, the <strong>Create Plan</strong> popup only shows the standalone plan option (ROI-only, no MLM
                team-income fields). Editing existing MLM plans is unchanged.
              </p>
            </div>
          </div>
          <div className="p-6 flex items-center justify-between gap-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div>
                  <p className="font-medium">{data?.standalonePlanCreationOnly ? "Enabled" : "Disabled"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Applies immediately after save.</p>
                </div>
                <Switch
                  checked={Boolean(data?.standalonePlanCreationOnly)}
                  onCheckedChange={(on) => persistStandalonePlanCreationOnly(on)}
                  disabled={isPending}
                />
              </>
            )}
          </div>
        </Card>

        <Card className="max-w-md">
          <div className="p-6 border-b border-border">
            <h3 className="font-bold text-lg">Send funds &amp; gift plan fee</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Same percentage for <strong>Send funds</strong> (peer wallet transfer) and <strong>Gift a plan</strong>{" "}
              (sponsored activation). On sends, the sender&apos;s wallet is debited the full amount you enter; the
              recipient receives the net after this fee (like withdrawal). On gifts, the payer is debited plan price
              plus this fee on top; the beneficiary&apos;s plan principal is unchanged.
            </p>
          </div>
          <div className="p-6 space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="peer-fee-pct">Fee percentage (%)</Label>
                  <Input
                    id="peer-fee-pct"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={peerPercent}
                    onChange={(e) => setPeerPercent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Default when unset in database: 0%.</p>
                </div>
                <Button type="button" onClick={onSavePeer} isLoading={isPending} className="w-full sm:w-auto">
                  Save peer / gift fee
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 border-b border-border flex items-start gap-3">
            <QrCode className="h-8 w-8 text-primary shrink-0" />
            <div>
              <h3 className="font-bold text-lg">Manual deposits (UPI)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Configure how users pay on <span className="text-foreground/90">Add funds</span>: dynamic amount-specific
                UPI links or a single static QR image.
              </p>
            </div>
          </div>
          <div className="p-6 space-y-8">
            {payLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <Label className="text-base">Deposits enabled</Label>
                    <p className="text-xs text-muted-foreground mt-1">When off, users cannot submit new deposit requests.</p>
                  </div>
                  <Switch checked={payEnabled} onCheckedChange={(v) => persistPayEnabled(v)} disabled={paySaving} />
                </div>

                <div className="space-y-3">
                  <Label className="text-base">Deposit method</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant={depositMethod === "dynamic_upi" ? "default" : "outline"}
                      disabled={paySaving}
                      onClick={() => persistDepositMethod("dynamic_upi")}
                    >
                      Dynamic UPI (recommended)
                    </Button>
                    <Button
                      type="button"
                      variant={depositMethod === "legacy_qr" ? "default" : "outline"}
                      disabled={paySaving}
                      onClick={() => persistDepositMethod("legacy_qr")}
                    >
                      Legacy static QR
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dynamic: users enter an amount, get a QR / Pay Now link (one of your UPI IDs is chosen at random).
                    Legacy: users scan one fixed QR you upload.
                  </p>
                </div>

                {depositMethod === "dynamic_upi" ? (
                  <div className="space-y-4 border-t border-border pt-6">
                    <div className="space-y-2 max-w-md">
                      <Label htmlFor="payee-name">Payee name (shown in UPI apps)</Label>
                      <Input
                        id="payee-name"
                        value={payeeName}
                        onChange={(e) => setPayeeName(e.target.value)}
                        placeholder="Telugu Earning Hub"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>UPI IDs</Label>
                      <p className="text-xs text-muted-foreground">
                        Add one or more VPAs. Each payment randomly uses one ID from this list.
                      </p>
                      <ul className="space-y-2 mt-2">
                        {upiIds.map((id) => (
                          <li
                            key={id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 font-mono text-sm"
                          >
                            {id}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive shrink-0"
                              onClick={() => removeUpiId(id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                        {upiIds.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No UPI IDs added yet.</p>
                        ) : null}
                      </ul>
                      <div className="flex flex-col sm:flex-row gap-2 max-w-md mt-2">
                        <Input
                          placeholder="e.g. merchant@ybl"
                          value={newUpiId}
                          onChange={(e) => setNewUpiId(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addUpiId();
                            }
                          }}
                        />
                        <Button type="button" variant="outline" className="gap-1 shrink-0" onClick={addUpiId}>
                          <Plus className="h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    </div>

                    <Button type="button" onClick={saveUpiSettings} isLoading={paySaving} className="w-full sm:w-auto">
                      Save UPI settings
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 border-t border-border pt-6">
                    {pay?.qrCodeImageUrl ? (
                      <div className="rounded-xl border border-border bg-secondary/20 p-4 inline-block">
                        <img src={pay.qrCodeImageUrl} alt="Current QR" className="max-w-[220px] h-auto rounded-lg" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No QR uploaded yet.</p>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="qr-up">Replace QR image</Label>
                      <input
                        id="qr-up"
                        ref={qrInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingQr}
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadQrFile(f);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 3 MB</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={uploadingQr}
                        isLoading={uploadingQr}
                        onClick={() => qrInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        Upload QR image
                      </Button>
                    </div>
                  </div>
                )}

                {pay?.updatedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(pay.updatedAt).toLocaleString()}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
